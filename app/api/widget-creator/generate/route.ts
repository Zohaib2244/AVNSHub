import { spawn } from "child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { HARNESS_CHAIN_DEFAULT, type HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { runHarnessChain, sendEvent, type SSEWriter } from "@/lib/widget-creator/harnessRunner";
import {
  readRegistry,
  componentName,
  findComponentModule,
  sanitizeComponentMap,
  registerCustomWidget,
  isValidCustomWidgetId,
} from "@/lib/widget-creator/customRegistry";
import { checkSkillOrError } from "@/lib/widget-creator/skillCheck";
import { acquireGenerationLock, releaseGenerationLock, describeBusyError } from "@/lib/widget-creator/generationLock";
import { snapshotGitStatus, unexpectedChanges } from "@/lib/widget-creator/gitAudit";
import { readProjectSpec, writeProjectSpec, buildProjectSpecMarkdown, type ProjectSpecMeta } from "@/lib/widget-creator/projectSpec";

const REPO_ROOT = process.cwd();

function readExistingWidget(slug: string): string {
  try {
    const dir = join(REPO_ROOT, "components/widgets/custom", slug);
    const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));
    return files.map((f) => `// ${f}\n${readFileSync(join(dir, f), "utf-8")}`).join("\n\n");
  } catch {
    return "";
  }
}

// --- Edit-mode file safety: backup before run, restore if .tsx goes missing --
// The harness may delete a .tsx to "rewrite from scratch" and then get cut off
// before writing the replacement (rate limit, error). The backup lets us put
// the working file back so the site never reaches a "module not found" state.

function backupWidgetFiles(slug: string): void {
  const dir = join(REPO_ROOT, "components/widgets/custom", slug);
  try {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
      copyFileSync(join(dir, f), join(dir, f + ".bak"));
    }
  } catch {}
}

// Restores a .tsx.bak → .tsx only when the .tsx is missing (file was deleted
// by the harness but never replaced). If the .tsx still exists — even broken —
// it's left alone so the next "fix" turn can repair it. Returns true if any
// file was restored.
function restoreMissingWidgetFiles(slug: string): boolean {
  const dir = join(REPO_ROOT, "components/widgets/custom", slug);
  let restored = false;
  try {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".tsx.bak"))) {
      const tsx = join(dir, f.slice(0, -4)); // strip ".bak"
      const bak = join(dir, f);
      if (!existsSync(tsx)) {
        copyFileSync(bak, tsx);
        restored = true;
      }
      unlinkSync(bak);
    }
  } catch {}
  return restored;
}

function deleteWidgetBackups(slug: string): void {
  const dir = join(REPO_ROOT, "components/widgets/custom", slug);
  try {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".tsx.bak"))) {
      unlinkSync(join(dir, f));
    }
  } catch {}
}

// Core user-facing prompt. The authoring guide itself lives in the
// "avn-widget-build" harness skill (.claude/skills/, .agents/skills/ — see
// scripts/sync-widget-skill.mjs, which regenerates it from
// docs/CREATING_WIDGETS.md) rather than being embedded here: claude, codex,
// and opencode all discover and load project-local skills in their headless
// invocation modes (verified directly against each CLI), so there's no need
// to pass ~6K tokens of guide text on every single turn.
function buildCorePrompt(settings: GenerateSettings, userPrompt: string): string {
  const existingIds = Object.keys(readRegistry());

  const isEdit = Boolean(settings.editSlug);
  const slug = settings.editSlug ?? settings.slug ?? "";
  const comp = slug ? componentName(slug) : "<Pascal>Widget";
  const existingCode = isEdit ? readExistingWidget(settings.editSlug!) : "";
  const existingSpec = isEdit ? readProjectSpec(settings.editSlug!) : null;

  // In edit mode the only settings that still apply are slug + the freeform
  // description/data fields actually describing this edit — name/icon/sizes/
  // orientations/HOE are create-time identity fields edited separately via the
  // deterministic update-meta route, and a stale value here (e.g. surviving
  // from a prior create-mode session) must never leak into an edit prompt.
  const settingsSummary = [
    !isEdit && settings.name && `Widget name: "${settings.name}"`,
    (settings.slug || settings.editSlug) && `Slug (id): "${settings.slug || settings.editSlug}"`,
    !isEdit && settings.icon && `Lucide icon: ${settings.icon}`,
    !isEdit && settings.sizes?.length && `Sizes: ${settings.sizes.join(", ")}`,
    !isEdit && settings.orientations?.length && `Orientations: ${settings.orientations.join(", ")}`,
    !isEdit && settings.hoe && `HOE (Hover On Expand): enabled, mode: ${settings.hoeMode ?? "default"}`,
    settings.sDescription && `S size content: ${settings.sDescription}`,
    settings.mDescription && `M size content: ${settings.mDescription}`,
    settings.lDescription && `L size content: ${settings.lDescription}`,
    settings.sImageRef && `S size visual reference: [image attached]`,
    settings.mImageRef && `M size visual reference: [image attached]`,
    settings.lImageRef && `L size visual reference: [image attached]`,
    settings.dataUrl && `Polling endpoint: ${settings.dataUrl}`,
    settings.dataShape && `Data shape: ${settings.dataShape}`,
  ]
    .filter(Boolean)
    .join("\n");

  const taskSection = isEdit
    ? `## Your task - EDITING an existing widget

You are MODIFYING the existing widget with slug \`${settings.editSlug}\`. DO NOT create a new widget.
- Overwrite \`components/widgets/custom/${settings.editSlug}/${comp}.tsx\` with the updated component (keep the named export \`export function ${comp}() { ... }\`)
- If sizes / icon / settings-schema change, also overwrite \`components/widgets/custom/${settings.editSlug}/manifest.json\` to match
- DO NOT touch any file under \`config/\` - the registration is managed automatically. The slug must stay the same.
${existingSpec ? `
## Project spec (authoritative — read this instead of exploring/guessing)

This describes the widget's intent and settings as of its last successful build. You do NOT need to Glob or Read other widgets' folders to understand what this one is for.

${existingSpec}` : ""}
## Current implementation (modify this)

\`\`\`tsx
${existingCode || "(could not read existing file - write a corrected version)"}
\`\`\``
    : `## Your task - creating a new widget

Write a new widget following the rules in the \`avn-widget-build\` skill. The widget lives entirely within its own folder \`components/widgets/custom/${slug || "<slug>"}/\`:
- \`${comp}.tsx\` - the component, with a named export \`export function ${comp}() { ... }\`
- \`manifest.json\` - the widget's manifest data (see "Required output" below)

Do NOT touch \`config/customWidgets.ts\`, \`config/customRegistry.json\`, \`config/customComponentMap.tsx\`, \`config/widgets.tsx\`, \`lib/layout.ts\`, or any other shared/core file - the registration into those is handled automatically after you finish. Existing custom widget ids: ${existingIds.length ? existingIds.join(", ") : "(none)"}.

The \`avn-widget-build\` skill (including its minimal complete example) is the full spec for this pattern. You do NOT need to Glob or Read other folders under \`components/widgets/custom/\` to infer conventions - load the skill and write directly from it plus the spec in this prompt.`;

  const skillSection = `\n## Authoring rules

Load the \`avn-widget-build\` skill now and follow it exactly - it covers the config/widgets.tsx manifest pattern, the custom-widget split-registry pattern, per-size layout, the settings schema, design tokens, and a minimal complete example.\n`;

  return `You are generating a widget for the AVN Hub project - a living personal dashboard built with Next.js, Tailwind, and Framer Motion.

${taskSection}
${skillSection}
## Widget spec from the user

${settingsSummary || "(No structured settings provided - infer from the prompt below.)"}
${!isEdit && settings.designReferenceHtml ? `
## Finalized design reference (from Ideate mode — match this exactly)

The user iterated on this mockup in the Ideate tool and finalized it as the target look. Recreate it precisely as a real widget component: same layout, spacing, colors, and animations — but translate the mockup's hardcoded hex values and inline \`<script>\` into the framework's real CSS variables/classes and React state, and branch content per size via \`useWidget().size\` instead of the mockup's separate static boxes.

\`\`\`html
${settings.designReferenceHtml}
\`\`\`
` : ""}
## User prompt

${userPrompt}

## Required output

1. Write \`components/widgets/custom/${slug || "<slug>"}/${comp}.tsx\` with the full widget component, exported as \`export function ${comp}() { ... }\` (named export - the file basename and export name must both be \`${comp}\`).

2. Write \`components/widgets/custom/${slug || "<slug>"}/manifest.json\` describing the widget. This is pure data - DO NOT write any config/*.ts(x) file; the build picks this manifest up automatically. Shape:
\`\`\`json
{
  "title": "${settings.name ?? (slug || "widget name")}",
  "iconName": "${settings.icon ?? "Box"}",
  "sizes": ${JSON.stringify(settings.sizes?.length ? settings.sizes : ["S", "M", "L"])},
  "orientations": ${JSON.stringify(settings.orientations?.length ? settings.orientations : ["h"])},
  "defaults": { "size": "M", "orientation": "h" },
  "settings": [
    { "key": "example", "label": "example", "type": "text", "default": "" }
  ]
}
\`\`\`
\`iconName\` must be a valid lucide-react icon name (PascalCase). \`settings\` is the widget's own config schema (each field is one of: \`{type:"toggle",default:boolean}\`, \`{type:"select",default:string,options:[{value,label}]}\`, \`{type:"text",default:string,placeholder?}\`, \`{type:"number",default:number,min?,max?}\`) - use \`[]\` if the widget has no options. \`defaults.size\`/\`defaults.orientation\` must be members of \`sizes\`/\`orientations\`.

3. If the widget needs an API route (for data fetching from an external source), also write \`app/api/${slug || "<slug>"}/route.ts\`.

4. Do NOT run \`npm run build\`, \`npm run dev\`, \`next build\`, \`next dev\`, or start any dev/build server yourself to verify your work — a dev server for this project is very likely already running, and a competing build process can corrupt its \`.next\` cache or fight over the port. Verification happens automatically after you stop: a deterministic \`tsc --noEmit\` check runs against exactly the files you wrote, and any errors come back to you on the next turn to fix. Just write the files and stop — do not attempt to compile or run anything to check your own work.

Design rules to follow:
- Use CSS variables for all colors: \`--text-primary\`, \`--text-muted\`, \`--accent-orange\`, \`--accent-cyan\`, \`--border\`, \`--bg-card\`, \`--bg-nested\`, \`--shadow\`
- Never hard-code hex values or use Inter/Roboto/Arial
- Use \`block-value\`, \`block-sub\`, \`block-label\`, \`more-head\`, \`more-row\` classes for consistent styling
- DotGothic16 for labels/stats, JetBrains Mono for data values
- Border radius 12-16px, hard offset box-shadow (no blur), 1.5px solid border
- Use \`usePolling\` from \`@/lib/usePolling\` for any data fetching, never bare setInterval

Start writing the files now.`;
}

export type GenerateSettings = {
  name?: string;
  slug?: string;
  /** if set, edit this existing custom widget instead of creating a new one */
  editSlug?: string;
  icon?: string;
  sizes?: string[];
  orientations?: string[];
  hoe?: boolean;
  hoeMode?: string;
  sDescription?: string;
  mDescription?: string;
  lDescription?: string;
  /** base64 data URL image references per size (for visual mockup context) */
  sImageRef?: string | null;
  mImageRef?: string | null;
  lImageRef?: string | null;
  dataUrl?: string;
  dataShape?: string;
  /** raw HTML/CSS source of a mockup finalized in Ideate mode — when present,
      the harness is asked to recreate it as the real widget (create mode only) */
  designReferenceHtml?: string;
  harness?: HarnessId;
  harnessChain?: HarnessId[];
};

export async function POST(req: Request) {
  // Clean up any stale entries (files deleted since last registration) before
  // doing anything else — this prevents a prior broken run from keeping the
  // site in a compilation error state across requests.
  sanitizeComponentMap();

  const body = (await req.json()) as {
    settings: GenerateSettings;
    prompt: string;
    harness?: HarnessId;
    harnessChain?: HarnessId[];
    /** claude session ID from a prior turn — when present, uses --resume so
        the model continues from its existing context instead of re-reading the
        full authoring guide + widget spec. Absent on the first turn. */
    sessionId?: string;
    /** carried over from the project's Plan-mode brief, if any — folded into
        the widget's SPEC.md so intent survives independent of the harness
        session or the browser's localStorage */
    projectMeta?: ProjectSpecMeta;
  };
  const { settings, prompt: userPrompt, harness: bodyHarness, harnessChain: bodyChain, sessionId: incomingSessionId, projectMeta } = body;

  const sseError = (message: string) =>
    new Response(`event: error\ndata: ${JSON.stringify({ message })}\n\n`, {
      headers: { "Content-Type": "text/event-stream" },
    });

  // Server-side slug validation — the client validates too, but slug/editSlug
  // are joined straight into filesystem paths (readExistingWidget,
  // readProjectSpec, backups), so never trust the client's copy of the check.
  for (const [label, value] of [["slug", settings.slug], ["editSlug", settings.editSlug]] as const) {
    if (value && !isValidCustomWidgetId(value)) {
      return sseError(`invalid ${label} "${value}" — use only lowercase letters, numbers, and hyphens`);
    }
  }

  const effectivePrompt = userPrompt.trim()
    || (settings.designReferenceHtml ? "Build the widget from the finalized design reference." : "");
  if (!effectivePrompt) {
    return sseError("describe the widget to build, or attach a finalized design reference first");
  }

  // Guard against a desynced client sending a "create" (no editSlug) for a
  // slug that already exists — without this, a stale `settings.slug` left
  // over from a prior edit session would look like a brand-new widget to the
  // registration branch below and could re-register over an already-working
  // widget's entry. Determined from registry state, not the client's flags.
  const targetId = settings.editSlug ?? settings.slug;
  const existedBeforeThisRun = Boolean(targetId && readRegistry()[targetId]);
  if (!settings.editSlug && settings.slug && existedBeforeThisRun) {
    return sseError(`A widget with id "${settings.slug}" already exists. Switch to edit mode to modify it instead of creating a new one.`);
  }

  // A create whose slug matches an existing app/api route (e.g. "uptime")
  // would let the generated route overwrite a core one — reject up front.
  if (!settings.editSlug && settings.slug && !existedBeforeThisRun
      && existsSync(join(REPO_ROOT, "app/api", settings.slug))) {
    return sseError(`slug "${settings.slug}" collides with an existing app/api route — pick another slug`);
  }

  const corePrompt = buildCorePrompt(settings, effectivePrompt);

  // Prefer top-level harness/chain (sent by ChatCanvas) over the legacy
  // settings.harness path — settings.harness was never reliably populated.
  const requestedHarness: HarnessId = bodyHarness ?? settings.harness ?? "claude";
  const chain: HarnessId[] = bodyChain ?? settings.harnessChain ?? HARNESS_CHAIN_DEFAULT;

  // The prompt only ever tells the harness to "load the avn-widget-build
  // skill" — it doesn't carry the authoring rules itself (see
  // docs/CREATING_WIDGETS.md's skill section). If the skill file isn't
  // actually there, generation must not silently proceed with a harness that
  // has no idea what the framework rules are.
  const skillError = checkSkillOrError("avn-widget-build", requestedHarness);
  if (skillError) {
    return sseError(skillError);
  }

  // One generation at a time, enforced where it actually matters — two
  // concurrent harnesses race on customComponentMap.tsx read-modify-writes,
  // registry JSON, and each other's tsc checks. (The client-side
  // workingProjectId lock is per-tab and can't see other tabs/devices.)
  const lock = acquireGenerationLock("generate");
  if (!lock.ok) {
    return sseError(describeBusyError(lock.holder, lock.ageMs));
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      const write: SSEWriter = (data) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // client disconnected
        }
      };

      try {

      // For edits: snapshot the existing .tsx files before spawning the harness.
      // If the harness deletes the file to "rewrite from scratch" and then gets
      // cut off (rate limit, error), restoreMissingWidgetFiles() puts the last
      // working version back so the site never reaches "module not found".
      if (existedBeforeThisRun && targetId) backupWidgetFiles(targetId);

      // Write-audit snapshot — taken after sanitizeComponentMap() and the
      // backups above so this run's own bookkeeping never shows up in the diff.
      const gitBefore = await snapshotGitStatus();

      // On a mid-run harness switch, hand the fallback whatever this widget's
      // files currently hold on disk (empty until something is written) so it
      // resumes from that exact state instead of re-discovering it with a burst
      // of Read/find/grep/git calls.
      const partialWork = targetId ? () => readExistingWidget(targetId) : undefined;

      // resumePrompt: for claude --resume turns the model already has full
      // context, so just send the bare user instruction. Full prompt is still
      // used for fallback harnesses that don't share the claude session.
      const resumePrompt = incomingSessionId
        ? effectivePrompt
        : undefined;

      const { outcome, sessionId: outSessionId } = await runHarnessChain(
        corePrompt, requestedHarness, chain, write, abortController.signal, partialWork,
        { sessionId: incomingSessionId, resumePrompt },
      );

      // Audit what the harness actually touched — the prompt tells it to stay
      // inside the widget's own folders, but bypassPermissions enforces
      // nothing. Runs before registration/SPEC writes so those never appear.
      // A user abort skips it (a killed run's partial writes aren't a policy
      // violation worth alarming about).
      if (outcome !== "aborted") {
        const gitAfter = await snapshotGitStatus();
        const unexpected = unexpectedChanges(gitBefore, gitAfter, [
          ...(targetId ? [`components/widgets/custom/${targetId}/`, `app/api/${targetId}/`] : []),
          "config/customRegistry.json",
          "config/customComponentMap.tsx",
          ".nutbot-ideate/",
        ]);
        if (unexpected.length > 0) {
          sendEvent(write, "audit", { unexpectedFiles: unexpected });
        }
      }

      if (outcome !== "done") {
        // Harness chain failed (or was stopped) — restore the backup so a
        // previously working edit stays working rather than disappearing.
        if (existedBeforeThisRun && targetId) restoreMissingWidgetFiles(targetId);
      }

      if (outcome === "done") {
        // done cleanly — the harness wrote the component + manifest.json.
        // Whether to wire it into the registry now is driven by
        // `existedBeforeThisRun` (actual prior registry state captured before
        // any mutation), NOT `settings.editSlug` — a desynced/stale client
        // flag must never be trusted here.
        //
        // - Already-committed widget (a real edit): re-register immediately.
        //   This only rewrites customRegistry.json (JSON data), which Fast
        //   Refresh hot-updates without a full reload, so it's safe to apply
        //   mid-chat exactly like before.
        // - Brand-new widget: do NOT register here. Wiring a new id into
        //   customComponentMap.tsx is the one write Fast Refresh can't
        //   hot-swap (full reload), which would tear down this SSE stream
        //   before the "done" event below ever reaches the client — the
        //   actual bug this split fixes. Registration for a new widget is
        //   deferred to POST /api/widget-creator/register, fired by the
        //   client's explicit "add to layout" click, so any number of
        //   refinement turns in this chat can run reload-free first.
        let ok = true;
        if (existedBeforeThisRun) {
          const wired = registerCustomWidget({
            id: targetId!,
            name: settings.name,
            icon: settings.icon,
            sizes: settings.sizes,
            orientations: settings.orientations,
          });
          if (!wired.ok) {
            sendEvent(write, "error", { message: `widget generated but registration failed: ${wired.error}` });
            ok = false;
          }
        } else if (!findComponentModule(targetId!)) {
          sendEvent(write, "error", { message: `widget generated but no component .tsx file was created in components/widgets/custom/${targetId}/` });
          ok = false;
        }

        if (!ok && existedBeforeThisRun && targetId) {
          // Registration failed or component file missing after a claimed-done run.
          // Restore the backup so the site stays in a working state.
          restoreMissingWidgetFiles(targetId);
        }

        if (ok) {
          sendEvent(write, "status", { type: "tsc_check" });
          const tscResult = await runTscCheck(targetId);
          if (tscResult.errors.length > 0) {
            sendEvent(write, "tsc_errors", { errors: tscResult.errors });
            // Restore the backup if the harness left the .tsx missing (deleted
            // to rewrite but never finished). If the .tsx exists but is broken
            // TypeScript, leave it on disk so the next "fix" turn can repair it.
            if (existedBeforeThisRun && targetId) restoreMissingWidgetFiles(targetId);
            sendEvent(write, "error", {
              message: existedBeforeThisRun
                ? "TypeScript errors in edited code — check the errors above and re-submit to fix."
                : "TypeScript errors in generated code — fix the errors above, then re-submit to try again.",
            });
          } else {
            // tsc clean — safe to drop the safety backup
            if (existedBeforeThisRun && targetId) deleteWidgetBackups(targetId);
            const doneSlug = settings.editSlug ?? settings.slug ?? null;
            // Keep SPEC.md current so the next turn — a fresh session, a
            // different device, or a "virtual" edit with no local project
            // history — has full intent/settings context without exploring.
            if (doneSlug) {
              writeProjectSpec(doneSlug, buildProjectSpecMarkdown(doneSlug, settings, projectMeta));
            }
            // Include sessionId so ChatCanvas can --resume on the next
            // refinement turn instead of re-sending the full ~6K-token prompt.
            sendEvent(write, "status", {
              type: "done",
              slug: doneSlug,
              registered: existedBeforeThisRun,
              sessionId: outSessionId,
            });
          }
        }
      }

      } finally {
        // Always release — a client abort flows cancel() → abort → the chain
        // resolves ("aborted") → here, so the lock can't leak on disconnect.
        releaseGenerationLock();
      }

      controller.close();
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function runTscCheck(targetId?: string): Promise<{ errors: string[] }> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsc", "--noEmit", "--pretty", "false"], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      // npx is npx.cmd on Windows — needs the shell to resolve (ENOENT otherwise)
      shell: process.platform === "win32",
    });

    let output = "";
    child.stdout.on("data", (d: Buffer) => (output += d.toString()));
    child.stderr.on("data", (d: Buffer) => (output += d.toString()));

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ errors: [] });
      } else {
        // Only surface errors that actually point at this widget's own tree —
        // a non-zero exit can come from pre-existing/unrelated project errors
        // (e.g. a stale .next/types/validator.ts referencing a route deleted by
        // a previous widget). Those must NOT count against this widget, or a
        // perfectly valid generation gets its registration rolled back for an
        // error it didn't cause. The widget's own generated app/api/<slug>
        // route IS part of its tree (the prompt invites writing one), so its
        // errors must not slip past this gate.
        const lines = output.split("\n").filter((l) =>
          l.includes("components/widgets/custom")
          || l.includes("config/custom")
          || (targetId ? l.includes(`app/api/${targetId}/`) : false),
        );
        resolve({ errors: lines });
      }
    });

    child.on("error", () => resolve({ errors: [] }));
  });
}

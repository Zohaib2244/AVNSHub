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
} from "@/lib/widget-creator/customRegistry";

const REPO_ROOT = process.cwd();

function readDoc(relPath: string): string {
  try {
    return readFileSync(join(REPO_ROOT, relPath), "utf-8");
  } catch {
    return "";
  }
}

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

// The authoring guide — stable 24KB doc. Returned separately so callers can
// send it via --append-system-prompt (cacheable system prefix on claude) rather
// than embedding it in the user turn on every request.
function buildSystemPrompt(): string {
  return readDoc("docs/CREATING_WIDGETS.md");
}

// Core user-facing prompt. `includeDoc` controls whether the authoring guide
// is embedded (needed for codex/opencode which have no system-prompt flag) or
// omitted (when it's already in claude's --append-system-prompt).
function buildCorePrompt(settings: GenerateSettings, userPrompt: string, includeDoc: boolean): string {
  const existingIds = Object.keys(readRegistry());

  const isEdit = Boolean(settings.editSlug);
  const slug = settings.editSlug ?? settings.slug ?? "";
  const comp = slug ? componentName(slug) : "<Pascal>Widget";
  const existingCode = isEdit ? readExistingWidget(settings.editSlug!) : "";

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

## Current implementation (modify this)

\`\`\`tsx
${existingCode || "(could not read existing file - write a corrected version)"}
\`\`\``
    : `## Your task - creating a new widget

Write a new widget following the rules in the authoring guide. The widget lives entirely within its own folder \`components/widgets/custom/${slug || "<slug>"}/\`:
- \`${comp}.tsx\` - the component, with a named export \`export function ${comp}() { ... }\`
- \`manifest.json\` - the widget's manifest data (see "Required output" below)

Do NOT touch \`config/customWidgets.ts\`, \`config/customRegistry.json\`, \`config/customComponentMap.tsx\`, \`config/widgets.tsx\`, \`lib/layout.ts\`, or any other shared/core file - the registration into those is handled automatically after you finish. Existing custom widget ids: ${existingIds.length ? existingIds.join(", ") : "(none)"}.

The authoring guide (including its minimal complete example) is the full spec for this pattern. You do NOT need to Glob or Read other folders under \`components/widgets/custom/\` to infer conventions - write directly from the guide and the spec in this prompt.`;

  const docSection = includeDoc
    ? `\n## Authoring guide (follow exactly)\n\n${buildSystemPrompt()}\n`
    : "";

  return `You are generating a widget for the AVN Hub project - a living personal dashboard built with Next.js, Tailwind, and Framer Motion.

${taskSection}
${docSection}
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
  };
  const { settings, prompt: userPrompt, harness: bodyHarness, harnessChain: bodyChain, sessionId: incomingSessionId } = body;

  // Guard against a desynced client sending a "create" (no editSlug) for a
  // slug that already exists — without this, a stale `settings.slug` left
  // over from a prior edit session would look like a brand-new widget to the
  // registration branch below and could re-register over an already-working
  // widget's entry. Determined from registry state, not the client's flags.
  const targetId = settings.editSlug ?? settings.slug;
  const existedBeforeThisRun = Boolean(targetId && readRegistry()[targetId]);
  if (!settings.editSlug && settings.slug && existedBeforeThisRun) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({
        message: `A widget with id "${settings.slug}" already exists. Switch to edit mode to modify it instead of creating a new one.`,
      })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }

  // Full prompt (doc included) — used for codex/opencode and fallbacks.
  // Lean prompt (doc excluded) — used for claude's user turn when the doc goes
  // via --append-system-prompt into the cacheable system-prefix instead.
  const fullPrompt = buildCorePrompt(settings, userPrompt, /* includeDoc */ true);
  const claudePrompt = buildCorePrompt(settings, userPrompt, /* includeDoc */ false);

  // Prefer top-level harness/chain (sent by ChatCanvas) over the legacy
  // settings.harness path — settings.harness was never reliably populated.
  const requestedHarness: HarnessId = bodyHarness ?? settings.harness ?? "claude";
  const chain: HarnessId[] = bodyChain ?? settings.harnessChain ?? HARNESS_CHAIN_DEFAULT;

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

      // For edits: snapshot the existing .tsx files before spawning the harness.
      // If the harness deletes the file to "rewrite from scratch" and then gets
      // cut off (rate limit, error), restoreMissingWidgetFiles() puts the last
      // working version back so the site never reaches "module not found".
      if (existedBeforeThisRun && targetId) backupWidgetFiles(targetId);

      // On a mid-run harness switch, hand the fallback whatever this widget's
      // files currently hold on disk (empty until something is written) so it
      // resumes from that exact state instead of re-discovering it with a burst
      // of Read/find/grep/git calls.
      const partialWork = targetId ? () => readExistingWidget(targetId) : undefined;

      // resumePrompt: for claude --resume turns the model already has full
      // context, so just send the bare user instruction. Full prompt is still
      // used for fallback harnesses that don't share the claude session.
      const resumePrompt = incomingSessionId
        ? userPrompt
        : undefined;

      const { outcome, sessionId: outSessionId } = await runHarnessChain(
        fullPrompt, requestedHarness, chain, write, abortController.signal, partialWork,
        { systemPrompt: buildSystemPrompt(), claudePrompt, sessionId: incomingSessionId, resumePrompt },
      );

      if (outcome !== "done") {
        // Harness chain failed entirely — restore the backup so a previously
        // working edit stays working rather than disappearing from the site.
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
          const tscResult = await runTscCheck();
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

async function runTscCheck(): Promise<{ errors: string[] }> {
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
        // Only surface errors that actually point at the custom widget tree —
        // a non-zero exit can come from pre-existing/unrelated project errors
        // (e.g. a stale .next/types/validator.ts referencing a route deleted by
        // a previous widget). Those must NOT count against this widget, or a
        // perfectly valid generation gets its registration rolled back for an
        // error it didn't cause.
        const lines = output.split("\n").filter((l) => l.includes("components/widgets/custom") || l.includes("config/custom"));
        resolve({ errors: lines });
      }
    });

    child.on("error", () => resolve({ errors: [] }));
  });
}

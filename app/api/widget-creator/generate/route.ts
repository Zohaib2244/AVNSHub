import { randomUUID } from "crypto";
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { HARNESS_CHAIN_DEFAULT, type HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { runHarnessChain, sendEvent, type SSEWriter } from "@/lib/widget-creator/harnessRunner";
import {
  readRegistry,
  componentName,
  findComponentModule,
  sanitizeComponentMap,
  registerCustomWidget,
  syncComponentMapEntry,
  isValidCustomWidgetId,
} from "@/lib/widget-creator/customRegistry";
import { checkSkillOrError } from "@/lib/widget-creator/skillCheck";
import { acquireGenerationLock, releaseGenerationLock, describeBusyError } from "@/lib/widget-creator/generationLock";
import { snapshotGitStatus, unexpectedChanges } from "@/lib/widget-creator/gitAudit";
import { readProjectSpec, writeProjectSpec, buildProjectSpecMarkdown, type ProjectSpecMeta } from "@/lib/widget-creator/projectSpec";
import {
  applyDeletes,
  applyWrites,
  commitBase,
  planApply,
  prepareWorkbench,
  revertOutsideChanges,
  runWorkbenchTsc,
  snapshotTree,
  workbenchCustomDir,
} from "@/lib/widget-creator/workbench";

const REPO_ROOT = process.cwd();

/** the widget's .tsx sources as one annotated block — read from the widget's
    workbench (its draft), not the live tree */
function readExistingWidget(slug: string, customDir: string): string {
  try {
    const dir = join(customDir, slug);
    const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));
    return files.map((f) => `// ${f}\n${readFileSync(join(dir, f), "utf-8")}`).join("\n\n");
  } catch {
    return "";
  }
}

// All harness writes happen in the widget's workbench (lib/widget-creator/
// workbench.ts, docs/WIDGET_WORKBENCH.md): a private mirror of the project
// outside the repo. The live tree changes only when a finished draft passes
// the TypeScript gate, so a half-written or deleted-then-re-added file can
// never reach the dev server. This replaced the old .tsx.bak backups and the
// componentKeepAlive watcher that raced Turbopack to undo deletions.

// --- Attached image delivery -------------------------------------------
// Data-URL images (chat attachments + the per-size visual refs) are written
// to temp files and referenced by absolute path in the prompt, so the harness
// can actually open them with its Read tool — base64 pasted into prompt text
// is just megabytes of characters the model can't see as pixels. (Before
// this, the per-size refs only produced an "[image attached]" line with no
// image behind it.)
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function writeImageTempFiles(
  images: Array<{ label: string; dataUrl: string }>,
): { section: string; paths: string[] } {
  const paths: string[] = [];
  const lines: string[] = [];
  for (const { label, dataUrl } of images.slice(0, MAX_IMAGES)) {
    const m = IMAGE_DATA_URL_RE.exec(dataUrl);
    if (!m) continue;
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) continue;
    const path = join(tmpdir(), `avnhub-ref-${randomUUID()}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
    try { writeFileSync(path, bytes); } catch { continue; }
    paths.push(path);
    lines.push(`- ${label}: ${path}`);
  }
  const section = lines.length
    ? `\n\n## Attached reference images\n\nThe user attached ${lines.length} reference image(s). View each with the Read tool BEFORE writing any code — they show exactly what is wanted:\n${lines.join("\n")}`
    : "";
  return { section, paths };
}

function cleanupImageTempFiles(paths: string[]): void {
  for (const p of paths) {
    try { unlinkSync(p); } catch {}
  }
}

// Core user-facing prompt. The authoring guide itself lives in the
// "avn-widget-build" harness skill (.claude/skills/, .agents/skills/ — see
// scripts/sync-widget-skill.mjs, which regenerates it from
// docs/CREATING_WIDGETS.md) rather than being embedded here: claude, codex,
// and opencode all discover and load project-local skills in their headless
// invocation modes (verified directly against each CLI), so there's no need
// to pass ~6K tokens of guide text on every single turn.
function buildCorePrompt(settings: GenerateSettings, userPrompt: string, customDir: string): string {
  const existingIds = Object.keys(readRegistry());

  const isEdit = Boolean(settings.editSlug);
  const slug = settings.editSlug ?? settings.slug ?? "";
  const comp = slug ? componentName(slug) : "<Pascal>Widget";
  const existingCode = isEdit ? readExistingWidget(settings.editSlug!, customDir) : "";
  const existingSpec = isEdit ? readProjectSpec(settings.editSlug!, customDir) : null;

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
    !isEdit && settings.requirements && `Full requirements (the complete spec — every listed field/control/behavior must be implemented; the per-size content fields below only divide these across sizes):\n${settings.requirements}`,
    // Per-size descriptions/notes are create-time snapshots from the original
    // Plan/Ideate brief — they never track chat-only edits made since, so on
    // edit turns they'd contradict the current code and tempt the model into
    // resurrecting already-removed elements. Edit turns rely on existingCode +
    // SPEC.md + the fresh user prompt instead.
    !isEdit && settings.sDescription && `S size content: ${settings.sDescription}`,
    !isEdit && settings.mDescription && `M size content: ${settings.mDescription}`,
    !isEdit && settings.lDescription && `L size content: ${settings.lDescription}`,
    settings.sImageRef && `S size visual reference: [image attached — see "Attached reference images" below for the file to Read]`,
    settings.mImageRef && `M size visual reference: [image attached — see "Attached reference images" below for the file to Read]`,
    settings.lImageRef && `L size visual reference: [image attached — see "Attached reference images" below for the file to Read]`,
    settings.dataUrl && `Polling endpoint: ${settings.dataUrl}`,
    settings.dataShape && `Data shape: ${settings.dataShape}`,
    !isEdit && settings.notes && `Additional notes: ${settings.notes}`,
  ]
    .filter(Boolean)
    .join("\n");

  const taskSection = isEdit
    ? `## Your task - EDITING an existing widget

You are MODIFYING the existing widget with slug \`${settings.editSlug}\`. DO NOT create a new widget.
- Overwrite \`components/widgets/custom/${settings.editSlug}/${comp}.tsx\` with the updated component (keep the named export \`export function ${comp}() { ... }\`)
- If sizes / icon / settings-schema change, also overwrite \`components/widgets/custom/${settings.editSlug}/manifest.json\` to match
- Also overwrite \`components/widgets/custom/${settings.editSlug}/SPEC.md\` so it keeps describing the widget accurately: update or remove any line that describes something you just changed or removed, and add a line for anything new. Keep everything else in it intact. This file is the durable record of intent for future edit turns (possibly weeks from now, or from a different device) — if it drifts from the real code, a future turn can misread old, already-removed intent as something still to build.
- DO NOT touch any file under \`config/\` - the registration is managed automatically. The slug must stay the same.
${existingSpec ? `
## Project spec (as of its last successful build — may be stale)

${existingSpec}` : ""}
## Current implementation (modify this — the source of truth for what actually exists right now)

\`\`\`tsx
${existingCode || "(could not read existing file - write a corrected version)"}
\`\`\`

The "Widget spec from the user" section below may still contain the *original* per-size descriptions/notes from when this widget was first planned — they are not automatically kept in sync with edits made since. Where they conflict with what you can see in the current implementation above (e.g. it describes something already removed), trust the current implementation and follow the fresh instruction in "User prompt" instead of reintroducing the old, already-changed content.`
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
${isEdit ? `
4. Overwrite \`components/widgets/custom/${settings.editSlug}/SPEC.md\` so it stays an accurate description of the widget after this edit (see the note about this above).
` : ""}
Do NOT run \`npm run build\`, \`npm run dev\`, \`next build\`, \`next dev\`, or start any dev/build server yourself to verify your work. You are working in a private copy of the project; verification happens automatically after you stop: a deterministic \`tsc --noEmit\` check runs against exactly the files you wrote, and any errors come back to you on the next turn to fix. Only after that passes are your files copied into the live dashboard. Just write the files (using relative paths) and stop — do not attempt to compile or run anything to check your own work.

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
  /** the Plan brief's master requirements record — the complete spec every
      stated field/control/behavior lives in; per-size descriptions divide it */
  requirements?: string;
  sDescription?: string;
  mDescription?: string;
  lDescription?: string;
  /** base64 data URL image references per size (for visual mockup context) */
  sImageRef?: string | null;
  mImageRef?: string | null;
  lImageRef?: string | null;
  dataUrl?: string;
  dataShape?: string;
  /** freeform extra context carried from Plan mode's brief (or typed directly
      here) — constraints, inspiration, things to avoid. Folded into the build
      prompt and archived into SPEC.md alongside the per-size descriptions. */
  notes?: string;
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
    sessionHarness?: HarnessId;
    repairErrors?: string[];
    /** carried over from the project's Plan-mode brief, if any — folded into
        the widget's SPEC.md so intent survives independent of the harness
        session or the browser's localStorage */
    projectMeta?: ProjectSpecMeta;
    /** base64 data-URL images attached to this chat turn (screenshots,
        design references) — written to temp files the harness can Read */
    images?: string[];
  };
  const { settings, prompt: userPrompt, harness: bodyHarness, harnessChain: bodyChain, sessionId: incomingSessionId, projectMeta } = body;

  const sseError = (message: string, code?: string) =>
    new Response(`event: error\ndata: ${JSON.stringify(code ? { message, code } : { message })}\n\n`, {
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
  if (!targetId) {
    return sseError("pick a widget name or slug before generating — the widget's workbench is keyed by it");
  }
  const existedBeforeThisRun = Boolean(readRegistry()[targetId]);
  if (!settings.editSlug && settings.slug && existedBeforeThisRun) {
    return sseError(`A widget with id "${settings.slug}" already exists. Switch to edit mode to modify it instead of creating a new one.`);
  }

  // A create whose slug matches an existing app/api route (e.g. "uptime")
  // would let the generated route overwrite a core one — reject up front.
  if (!settings.editSlug && settings.slug && !existedBeforeThisRun
      && existsSync(join(REPO_ROOT, "app/api", settings.slug))) {
    return sseError(`slug "${settings.slug}" collides with an existing app/api route — pick another slug`);
  }

  // Write any attached images to temp files and fold a Read-tool pointer
  // section into the user prompt — this augmented prompt feeds both the full
  // core prompt and the bare --resume prompt, so images work on every turn.
  const { section: imageSection, paths: imagePaths } = writeImageTempFiles([
    ...(Array.isArray(body.images)
      ? body.images.map((dataUrl, i) => ({ label: `chat attachment ${i + 1}`, dataUrl }))
      : []),
    ...(settings.sImageRef ? [{ label: "S size visual reference", dataUrl: settings.sImageRef }] : []),
    ...(settings.mImageRef ? [{ label: "M size visual reference", dataUrl: settings.mImageRef }] : []),
    ...(settings.lImageRef ? [{ label: "L size visual reference", dataUrl: settings.lImageRef }] : []),
  ]);
  const repairErrors = Array.isArray(body.repairErrors) ? body.repairErrors.filter((e): e is string => typeof e === "string").slice(0, 20).map((e) => e.slice(0, 1000)) : [];
  const promptWithImages = effectivePrompt + imageSection + (repairErrors.length ? "\n\nCompiler diagnostics from the previous attempt:\n" + repairErrors.join("\n") : "");

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
    cleanupImageTempFiles(imagePaths);
    return sseError(skillError, "skill-missing");
  }

  // One generation at a time, enforced where it actually matters — two
  // concurrent harnesses race on customComponentMap.tsx read-modify-writes,
  // registry JSON, and each other's tsc checks. (The client-side
  // workingProjectId lock is per-tab and can't see other tabs/devices.)
  const lock = acquireGenerationLock("generate");
  if (!lock.ok) {
    cleanupImageTempFiles(imagePaths);
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

      // Prepare (or refresh) this widget's workbench under the lock, then build
      // the prompt from its draft — on a fix turn that's the harness's own
      // previous attempt, not the live version.
      const ws = await prepareWorkbench(targetId);
      const wbCustomDir = workbenchCustomDir(ws);
      if (ws.discardedDraft) {
        sendEvent(write, "chunk", {
          text: `[workbench] "${targetId}" changed outside the creator while an unfinished draft was pending — the draft was discarded and this turn starts from the live version.\n`,
        });
      }
      const corePrompt = buildCorePrompt(settings, promptWithImages, wbCustomDir);

      // Write-audit snapshot of the LIVE tree — the harness now works in the
      // workbench, so any change here during the run is an absolute-path write
      // that escaped it.
      const gitBefore = await snapshotGitStatus();
      const treeBefore = snapshotTree(ws.tree);

      // On a mid-run harness switch, hand the fallback whatever the draft
      // currently holds so it resumes from that exact state.
      const partialWork = () => readExistingWidget(targetId, wbCustomDir);

      // Claude stores sessions per working directory, so a session started
      // before this workbench existed (e.g. in the repo root) can't resume
      // here — start fresh with the full prompt instead of failing the resume.
      const sessionId = ws.created ? undefined : incomingSessionId;
      const resumePrompt = sessionId ? promptWithImages : undefined;

      const { outcome, sessionId: outSessionId, harness: completedHarness } = await runHarnessChain(
        corePrompt, requestedHarness, chain, write, abortController.signal, partialWork,
        { sessionId: (body.sessionHarness ?? "claude") === requestedHarness ? sessionId : undefined, resumePrompt, stage: repairErrors.length ? "fix" : "build", cwd: ws.tree }, targetId,
      );

      if (outSessionId) sendEvent(write, "session", { sessionId: outSessionId, harness: completedHarness, slug: targetId });

      // Keep the mirror faithful: anything written outside the widget's own
      // folders is put back and reported, never applied.
      const outsideWorkbench = revertOutsideChanges(ws, treeBefore);
      if (outcome !== "aborted") {
        const gitAfter = await snapshotGitStatus();
        const escaped = unexpectedChanges(gitBefore, gitAfter, [".nutbot-ideate/"]);
        const unexpected = [...new Set([...outsideWorkbench, ...escaped])].sort();
        if (unexpected.length > 0) sendEvent(write, "audit", { unexpectedFiles: unexpected });
      }

      if (outcome === "done") {
        let ok = true;
        if (!findComponentModule(targetId, wbCustomDir)) {
          sendEvent(write, "error", { message: `no component .tsx file was written in components/widgets/custom/${targetId}/ — nothing was applied` });
          ok = false;
        }

        if (ok) {
          sendEvent(write, "status", { type: "tsc_check" });
          const tscResult = await runWorkbenchTsc(ws);
          if (tscResult.errors.length > 0) {
            // The draft stays in the workbench for the next fix turn; the live
            // widget is untouched and keeps working.
            sendEvent(write, "tsc_errors", { errors: tscResult.errors });
            sendEvent(write, "error", {
              message: existedBeforeThisRun
                ? "TypeScript errors in the edited draft — nothing was applied, your widget is unchanged. Re-submit to fix."
                : "TypeScript errors in the generated draft — fix the errors above, then re-submit to try again.",
            });
            ok = false;
          }
        }

        if (ok) {
          // Write SPEC.md fresh only on the initial create — `settings` is
          // accurate at that point. On an edit turn, `settings` still holds
          // whatever per-size descriptions/notes were set back at Plan/Ideate
          // time (never kept in sync with chat-only edits since), so
          // regenerating SPEC.md from it would re-bake stale text as
          // "authoritative" on every turn; the edit prompt asks the harness to
          // update SPEC.md itself instead. Written into the draft so it applies
          // together with the component.
          if (!existedBeforeThisRun) {
            writeProjectSpec(targetId, buildProjectSpecMarkdown(targetId, settings, projectMeta), wbCustomDir);
          }

          const applied = planApply(ws);
          if (!applied.ok) {
            sendEvent(write, "error", {
              message: `"${targetId}" was changed outside the creator during this run (${applied.conflicts.join(", ")}) — nothing was applied. Re-submit to rebuild on top of the current version.`,
            });
            ok = false;
          } else {
            // New and changed files land first (atomic per file), then an
            // already-registered widget's registry entry and map line are
            // refreshed, and only then are removed files deleted — so the
            // component map never points at a file that isn't there.
            applyWrites(ws, applied.plan);
            if (existedBeforeThisRun) {
              // - Already-committed widget (a real edit): re-register now. This
              //   rewrites customRegistry.json (JSON Fast Refresh hot-updates)
              //   and repoints the map line only if the component file changed.
              // - Brand-new widget: registration is deferred to POST
              //   /api/widget-creator/register ("add to layout"), because
              //   wiring a new id into customComponentMap.tsx forces a full
              //   reload that would tear down this SSE stream.
              const wired = registerCustomWidget({
                id: targetId,
                name: settings.name,
                icon: settings.icon,
                sizes: settings.sizes,
                orientations: settings.orientations,
              });
              if (!wired.ok) {
                sendEvent(write, "error", { message: `widget applied but registration failed: ${wired.error}` });
                ok = false;
              }
              syncComponentMapEntry(targetId);
            }
            applyDeletes(applied.plan);
            commitBase(ws);
          }
        }

        if (ok) {
          // Include sessionId so ChatCanvas can --resume on the next
          // refinement turn instead of re-sending the full ~6K-token prompt.
          sendEvent(write, "status", {
            type: "done",
            slug: targetId,
            registered: existedBeforeThisRun,
            sessionId: outSessionId,
            harness: completedHarness,
          });
        }
      }

      } catch (err) {
        sendEvent(write, "error", { message: `widget creator failed: ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        // Always release — a client abort flows cancel() → abort → the chain
        // resolves ("aborted") → here, so the lock can't leak on disconnect.
        releaseGenerationLock();
        cleanupImageTempFiles(imagePaths);
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

import { spawn } from "child_process";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { HARNESS_ADAPTERS, HARNESS_CHAIN_DEFAULT, type HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { lineSignalsLimit } from "@/lib/widget-creator/limitDetection";
import {
  readRegistry,
  upsertRegistryEntry,
  addToComponentMap,
  buildRegistryEntry,
  mergeWidgetManifest,
  componentName,
  findComponentModule,
  sanitizeComponentMap,
  removeFromComponentMap,
  removeRegistryEntry,
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

function buildPrompt(settings: GenerateSettings, userPrompt: string): string {
  const creatingWidgetsDoc = readDoc("docs/CREATING_WIDGETS.md");
  const existingIds = Object.keys(readRegistry());

  const isEdit = Boolean(settings.editSlug);
  const slug = settings.editSlug ?? settings.slug ?? "";
  const comp = slug ? componentName(slug) : "<Pascal>Widget";
  const existingCode = isEdit ? readExistingWidget(settings.editSlug!) : "";

  const settingsSummary = [
    settings.name && `Widget name: "${settings.name}"`,
    (settings.slug || settings.editSlug) && `Slug (id): "${settings.slug || settings.editSlug}"`,
    settings.icon && `Lucide icon: ${settings.icon}`,
    settings.sizes?.length && `Sizes: ${settings.sizes.join(", ")}`,
    settings.orientations?.length && `Orientations: ${settings.orientations.join(", ")}`,
    settings.hoe && `HOE (Hover On Expand): enabled, mode: ${settings.hoeMode ?? "default"}`,
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
    ? `## Your task â€” EDITING an existing widget

You are MODIFYING the existing widget with slug \`${settings.editSlug}\`. DO NOT create a new widget.
- Overwrite \`components/widgets/custom/${settings.editSlug}/${comp}.tsx\` with the updated component (keep the named export \`export function ${comp}() { ... }\`)
- If sizes / icon / settings-schema change, also overwrite \`components/widgets/custom/${settings.editSlug}/manifest.json\` to match
- DO NOT touch any file under \`config/\` â€” the registration is managed automatically. The slug must stay the same.

## Current implementation (modify this)

\`\`\`tsx
${existingCode || "(could not read existing file â€” write a corrected version)"}
\`\`\``
    : `## Your task â€” creating a new widget

Write a new widget following the rules in the authoring guide below. The widget lives entirely within its own folder \`components/widgets/custom/${slug || "<slug>"}/\`:
- \`${comp}.tsx\` â€” the component, with a named export \`export function ${comp}() { ... }\`
- \`manifest.json\` â€” the widget's manifest data (see "Required output" below)

Do NOT touch \`config/customWidgets.ts\`, \`config/customRegistry.json\`, \`config/customComponentMap.tsx\`, \`config/widgets.tsx\`, \`lib/layout.ts\`, or any other shared/core file â€” the registration into those is handled automatically after you finish. Existing custom widget ids: ${existingIds.length ? existingIds.join(", ") : "(none)"}.`;

  return `You are generating a widget for the AVN Hub project â€” a living personal dashboard built with Next.js, Tailwind, and Framer Motion.

${taskSection}

## Authoring guide (follow exactly)

${creatingWidgetsDoc}

## Widget spec from the user

${settingsSummary || "(No structured settings provided â€” infer from the prompt below.)"}

## User prompt

${userPrompt}

## Required output

1. Write \`components/widgets/custom/${slug || "<slug>"}/${comp}.tsx\` with the full widget component, exported as \`export function ${comp}() { ... }\` (named export â€” the file basename and export name must both be \`${comp}\`).

2. Write \`components/widgets/custom/${slug || "<slug>"}/manifest.json\` describing the widget. This is pure data â€” DO NOT write any config/*.ts(x) file; the build picks this manifest up automatically. Shape:
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
\`iconName\` must be a valid lucide-react icon name (PascalCase). \`settings\` is the widget's own config schema (each field is one of: \`{type:"toggle",default:boolean}\`, \`{type:"select",default:string,options:[{value,label}]}\`, \`{type:"text",default:string,placeholder?}\`, \`{type:"number",default:number,min?,max?}\`) â€” use \`[]\` if the widget has no options. \`defaults.size\`/\`defaults.orientation\` must be members of \`sizes\`/\`orientations\`.

3. If the widget needs an API route (for data fetching from an external source), also write \`app/api/${slug || "<slug>"}/route.ts\`.

Design rules to follow:
- Use CSS variables for all colors: \`--text-primary\`, \`--text-muted\`, \`--accent-orange\`, \`--accent-cyan\`, \`--border\`, \`--bg-card\`, \`--bg-nested\`, \`--shadow\`
- Never hard-code hex values or use Inter/Roboto/Arial
- Use \`block-value\`, \`block-sub\`, \`block-label\`, \`more-head\`, \`more-row\` classes for consistent styling
- DotGothic16 for labels/stats, JetBrains Mono for data values
- Border radius 12â€“16px, hard offset box-shadow (no blur), 1.5px solid border
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
  harness?: HarnessId;
  harnessChain?: HarnessId[];
};

type SSEWriter = (data: string) => void;

function sendEvent(write: SSEWriter, event: string, payload: Record<string, unknown>) {
  write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function runHarness(
  adapter: (typeof HARNESS_ADAPTERS)[HarnessId],
  prompt: string,
  write: SSEWriter,
  signal: AbortSignal,
  continuationNote?: string,
): Promise<"done" | "limit" | "error"> {
  return new Promise((resolve) => {
    const fullPrompt = continuationNote ? `${continuationNote}\n\n${prompt}` : prompt;

    sendEvent(write, "status", { type: "harness_start", harness: adapter.id });

    // opencode's `run` subcommand has no stdin-reading mode — the prompt must
    // be a trailing positional arg there, vs. stdin for claude/codex
    const args = adapter.promptViaArg ? [...adapter.args, fullPrompt] : adapter.args;

    const child = spawn(adapter.command, args, {
      cwd: REPO_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      // on Windows the CLIs are .cmd/.ps1 shims that bare spawn can't resolve
      // (ENOENT) — run through the shell so PATHEXT resolution applies
      shell: process.platform === "win32",
    });

    if (adapter.promptViaArg) {
      child.stdin.end();
    } else {
      child.stdin.write(fullPrompt);
      child.stdin.end();
    }

    let hitLimit = false;
    let buffer = "";

    function processLine(line: string) {
      // Skip limit detection on frames carrying actual model/tool content —
      // generated code can legitimately mention "rate limit", "overloaded",
      // etc. as plain text, and checking the raw JSON-encoded line would fire
      // a false positive switch. Covers all three adapters' content frames:
      // claude (message.content), codex (item), opencode (part).
      let isGeneratedContent = false;
      try {
        const f = JSON.parse(line);
        isGeneratedContent = Boolean(f.message?.content) || Boolean(f.item) || Boolean(f.part);
      } catch {}

      if (!isGeneratedContent && lineSignalsLimit(line)) {
        hitLimit = true;
        return;
      }
      const text = adapter.parseChunk(line);
      if (text) sendEvent(write, "chunk", { text });
    }

    child.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });

    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      if (lineSignalsLimit(text)) hitLimit = true;
    });

    child.on("close", () => {
      if (buffer) processLine(buffer);
      resolve(hitLimit ? "limit" : "done");
    });

    child.on("error", (err) => {
      const hint = (err as NodeJS.ErrnoException).code === "ENOENT"
        ? ` — is the "${adapter.command}" CLI installed and on PATH?`
        : "";
      sendEvent(write, "error", { message: `Failed to start ${adapter.id}: ${err.message}${hint}` });
      resolve("error");
    });

    signal.addEventListener("abort", () => {
      child.kill("SIGTERM");
    });
  });
}

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
  };
  const { settings, prompt: userPrompt, harness: bodyHarness, harnessChain: bodyChain } = body;

  const fullPrompt = buildPrompt(settings, userPrompt);

  // Prefer top-level harness/chain (sent by ChatCanvas) over the legacy
  // settings.harness path — settings.harness was never reliably populated.
  const requestedHarness: HarnessId = bodyHarness ?? settings.harness ?? "claude";
  const chain: HarnessId[] = bodyChain ?? settings.harnessChain ?? HARNESS_CHAIN_DEFAULT;

  // build the ordered list starting from the requested harness
  const startIdx = chain.indexOf(requestedHarness);
  const orderedChain = startIdx >= 0 ? [...chain.slice(startIdx), ...chain.slice(0, startIdx)] : chain;

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

      let continuationNote: string | undefined;

      for (let i = 0; i < orderedChain.length; i++) {
        const harnessId = orderedChain[i];
        const adapter = HARNESS_ADAPTERS[harnessId];

        if (!adapter) continue;

        const result = await runHarness(adapter, fullPrompt, write, abortController.signal, continuationNote);

        if (result === "limit" || result === "error") {
          // rate-limited or failed to start — fall back to the next harness
          const nextId = orderedChain[i + 1];
          if (nextId) {
            const reason = result === "limit" ? "rate limit" : "failed to start";
            sendEvent(write, "switch", { from: harnessId, to: nextId, reason });
            // only a rate-limited run left partial work worth continuing
            continuationNote =
              result === "limit"
                ? `The previous harness (${harnessId}) started but hit its rate limit. ` +
                  `Inspect the partial output already written to disk and CONTINUE from where it stopped.`
                : undefined;
            continue;
          }
          // no fallback left — for a limit, say so; an error already emitted its message
          if (result === "limit") {
            sendEvent(write, "error", { message: "All harnesses hit their rate limit. Try again later." });
          }
          break;
        } else {
          // done cleanly â€” wire the new/edited widget into the registry
          // deterministically (JSON entry + one lazy line), THEN type-check the
          // wired-up state. The harness only wrote the component + manifest.json.
          const wired = writeWidgetConfig(settings);
          if (!wired.ok) {
            sendEvent(write, "error", { message: `widget generated but registration failed: ${wired.error}` });
            break;
          }
          sendEvent(write, "status", { type: "tsc_check" });
          const tscResult = await runTscCheck();
          if (tscResult.errors.length > 0) {
            sendEvent(write, "tsc_errors", { errors: tscResult.errors });
            // For new widgets: roll back the registration so a broken component
            // can't keep the build in a "Module not found" / type error state.
            // The generated files are kept on disk — the user can ask to fix them.
            // For edits: leave the registration intact (it existed before this run).
            const isNew = !settings.editSlug;
            if (isNew && settings.slug) {
              removeFromComponentMap(settings.slug);
              removeRegistryEntry(settings.slug);
            }
            sendEvent(write, "error", {
              message: isNew
                ? "TypeScript errors in generated code — registration rolled back. Fix the errors above, then re-submit to try again."
                : "TypeScript errors in edited code — check the errors above and re-submit to fix.",
            });
          } else {
            const doneSlug = settings.editSlug ?? settings.slug ?? null;
            sendEvent(write, "status", { type: "done", slug: doneSlug });
          }
          break;
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

/** After the harness writes the component + manifest.json, register the widget
    into the split config deterministically: build the entry from the creator
    settings, overlay the validated per-widget manifest.json, write it to
    customRegistry.json, and append the one lazy line to customComponentMap.tsx. */
function writeWidgetConfig(settings: GenerateSettings): { ok: boolean; error?: string } {
  const id = settings.editSlug ?? settings.slug;
  if (!id) return { ok: false, error: "no slug provided" };
  if (!/^[a-z0-9-]+$/.test(id)) return { ok: false, error: `invalid slug "${id}"` };

  const dir = join(REPO_ROOT, "components/widgets/custom", id);
  const mod = findComponentModule(id);
  if (!mod) {
    return { ok: false, error: `no component .tsx file was created in components/widgets/custom/${id}/` };
  }

  const existing = readRegistry()[id];
  let entry = buildRegistryEntry(
    { id, name: settings.name, icon: settings.icon, sizes: settings.sizes, orientations: settings.orientations },
    existing,
  );

  // overlay the LLM-authored per-widget manifest.json when it parses cleanly;
  // a malformed manifest is ignored so it can never corrupt the registry
  const manifestPath = join(dir, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      entry = mergeWidgetManifest(entry, JSON.parse(readFileSync(manifestPath, "utf-8")));
    } catch {
      /* keep the settings-derived entry */
    }
  }

  upsertRegistryEntry(id, entry);
  addToComponentMap(id, mod);
  return { ok: true };
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
        // only surface errors in the custom widget directory
        const lines = output.split("\n").filter((l) => l.includes("components/widgets/custom") || l.includes("config/custom"));
        resolve({ errors: lines.length > 0 ? lines : output.split("\n").filter(Boolean).slice(0, 10) });
      }
    });

    child.on("error", () => resolve({ errors: [] }));
  });
}

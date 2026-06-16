import { spawn } from "child_process";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { HARNESS_ADAPTERS, HARNESS_CHAIN_DEFAULT, type HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { lineSignalsLimit } from "@/lib/widget-creator/limitDetection";

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
  const customWidgetsContent = readDoc("config/customWidgets.tsx");

  const isEdit = Boolean(settings.editSlug);
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
    ? `## Your task — EDITING an existing widget

You are MODIFYING the existing widget with slug \`${settings.editSlug}\`. DO NOT create a new widget.
- Overwrite \`components/widgets/custom/${settings.editSlug}/<ComponentName>.tsx\` with the updated component
- Update the manifest entry in \`config/customWidgets.tsx\` ONLY if settings (sizes, icon, etc.) need to change; the slug and order must stay the same
- DO NOT add a second entry to CUSTOM_DEFAULT_ORDER

## Current implementation (modify this)

\`\`\`tsx
${existingCode || "(could not read existing file — write a corrected version)"}
\`\`\``
    : `## Your task — creating a new widget

Write a new widget following the rules in the authoring guide below. The widget should live entirely within:
- \`components/widgets/custom/<slug>/<ComponentName>.tsx\` (the component)
- \`config/customWidgets.tsx\` (the manifest registration — append to, don't replace)

Do NOT touch \`config/widgets.tsx\`, \`lib/layout.ts\`, or any other core framework file.`;

  return `You are generating a widget for the NutMag Card project — a living developer identity card built with Next.js, Tailwind, and Framer Motion.

${taskSection}

## Authoring guide (follow exactly)

${creatingWidgetsDoc}

## customWidgets.tsx (current state — append your widget here)

\`\`\`tsx
${customWidgetsContent}
\`\`\`

## Widget spec from the user

${settingsSummary || "(No structured settings provided — infer from the prompt below.)"}

## User prompt

${userPrompt}

## Required output

1. Write \`components/widgets/custom/<slug>/<ComponentName>.tsx\` with the full widget component.
2. Update \`config/customWidgets.tsx\` by inserting:
   - The lucide icon import and component import between the "generated imports" comment markers
   - The manifest object between the "generated widgets" comment markers
   - The slug string between the "generated order" comment markers

When writing imports in customWidgets.tsx, use this exact format:
\`\`\`
// --- generated imports start ---
import { IconName } from "lucide-react";
import { ComponentName } from "@/components/widgets/custom/<slug>/ComponentName";
// --- generated imports end ---
\`\`\`

3. If the widget needs an API route (for data fetching from an external source), also write \`app/api/<slug>/route.ts\`.

Design rules to follow:
- Use CSS variables for all colors: \`--text-primary\`, \`--text-muted\`, \`--accent-orange\`, \`--accent-cyan\`, \`--border\`, \`--bg-card\`, \`--bg-nested\`, \`--shadow\`
- Never hard-code hex values or use Inter/Roboto/Arial
- Use \`block-value\`, \`block-sub\`, \`block-label\`, \`more-head\`, \`more-row\` classes for consistent styling
- DotGothic16 for labels/stats, JetBrains Mono for data values
- Border radius 12–16px, hard offset box-shadow (no blur), 1.5px solid border
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
): Promise<"done" | "limit"> {
  return new Promise((resolve) => {
    const fullPrompt = continuationNote ? `${continuationNote}\n\n${prompt}` : prompt;

    sendEvent(write, "status", { type: "harness_start", harness: adapter.id });

    const child = spawn(adapter.command, adapter.args, {
      cwd: REPO_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    // write prompt to stdin
    child.stdin.write(fullPrompt);
    child.stdin.end();

    let hitLimit = false;
    let buffer = "";

    function processLine(line: string) {
      if (lineSignalsLimit(line)) {
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
      sendEvent(write, "error", { message: `Failed to start ${adapter.id}: ${err.message}` });
      resolve("done");
    });

    signal.addEventListener("abort", () => {
      child.kill("SIGTERM");
    });
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { settings: GenerateSettings; prompt: string };
  const { settings, prompt: userPrompt } = body;

  const fullPrompt = buildPrompt(settings, userPrompt);

  const requestedHarness: HarnessId = settings.harness ?? "claude";
  const chain: HarnessId[] = settings.harnessChain ?? HARNESS_CHAIN_DEFAULT;

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

        if (result === "limit") {
          const nextId = orderedChain[i + 1];
          if (nextId) {
            sendEvent(write, "switch", { from: harnessId, to: nextId, reason: "rate limit" });
            continuationNote =
              `The previous harness (${harnessId}) started but hit its rate limit. ` +
              `Inspect the partial output already written to disk and CONTINUE from where it stopped.`;
          } else {
            sendEvent(write, "error", { message: "All harnesses hit their rate limit. Try again later." });
          }
        } else {
          // done cleanly — run tsc check
          sendEvent(write, "status", { type: "tsc_check" });
          const tscResult = await runTscCheck();
          if (tscResult.errors.length > 0) {
            sendEvent(write, "tsc_errors", { errors: tscResult.errors });
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

async function runTscCheck(): Promise<{ errors: string[] }> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsc", "--noEmit", "--pretty", "false"], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (d: Buffer) => (output += d.toString()));
    child.stderr.on("data", (d: Buffer) => (output += d.toString()));

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ errors: [] });
      } else {
        // only surface errors in the custom widget directory
        const lines = output.split("\n").filter((l) => l.includes("components/widgets/custom") || l.includes("config/customWidgets"));
        resolve({ errors: lines.length > 0 ? lines : output.split("\n").filter(Boolean).slice(0, 10) });
      }
    });

    child.on("error", () => resolve({ errors: [] }));
  });
}

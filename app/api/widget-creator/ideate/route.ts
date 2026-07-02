// Ideate mode — generates throwaway HTML/CSS widget mockups (visualization +
// animation only, no real component) so the user can compare variations
// before committing to a real build via /api/widget-creator/generate.
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { HARNESS_CHAIN_DEFAULT, type HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { runHarnessChain, sendEvent, type SSEWriter } from "@/lib/widget-creator/harnessRunner";
import { isValidIdeateSessionId, sessionDirFor, variationFile } from "@/lib/widget-creator/ideateStore";
import { acquireGenerationLock, releaseGenerationLock, describeBusyError } from "@/lib/widget-creator/generationLock";
import type { WidgetBrief } from "@/lib/widget-creator/projectStore";

const REPO_ROOT = process.cwd();

// Pull the default (dark "ember") token values straight out of the real
// stylesheet instead of hand-copying hex values here — this used to be a
// separate hardcoded :root block that could silently drift from
// styles/globals.css whenever the palette was retuned. Falls back to the
// last-known-good block only if globals.css can't be read at all.
const FALLBACK_ROOT_TOKENS = `--bg-page: #13100c;
  --bg-card: #1e1a14;
  --bg-nested: #1a1610;
  --border: #3d3220;
  --shadow: #070604;
  --text-primary: #e8dfc8;
  --text-muted: #9f9887;
  --text-muted-dim: #8b8475;
  --accent-orange: #ff6b2b;
  --accent-cyan: #00b4c8;`;

function readDefaultRootTokens(): string {
  try {
    const css = readFileSync(join(REPO_ROOT, "styles/globals.css"), "utf-8");
    const match = css.match(/:root\s*\{([^}]*)\}/);
    return match ? match[1].trim() : FALLBACK_ROOT_TOKENS;
  } catch {
    return FALLBACK_ROOT_TOKENS;
  }
}

// Few-shot structural/style reference trimmed from the user's own hand-built
// Ideate mockups use the same dark "ember" palette tokens and chunky
// sticker-card chrome the real widget framework uses.
const STYLE_REFERENCE = `<style>
  :root {
    ${readDefaultRootTokens()}
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg-page); color: var(--text-primary); font-family: 'JetBrains Mono', monospace; padding: 32px; }
  .block {
    position: relative; background: var(--bg-card); border-radius: 14px;
    border: 1.5px solid var(--border); box-shadow: 4px 4px 0 var(--shadow);
    overflow: hidden; display: flex; flex-direction: column;
  }
  .block-label {
    display: flex; align-items: center; gap: 6px;
    font-family: 'DotGothic16', sans-serif; font-size: 0.62rem; text-transform: uppercase;
    letter-spacing: 0.14em; color: var(--text-muted); padding: 10px 12px; flex: none;
  }
  svg.ic { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.75; flex: none; }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=DotGothic16&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />`;

/** Fields from the Plan-mode brief that aren't already covered by the free-text
    `prompt` (which is usually seeded from brief.concept/title) — surfaced here
    so Ideate's mockups reflect per-size intent and data shape too, not just
    the one-sentence concept the user sees pre-filled in the textbox. */
function briefContextSection(brief?: WidgetBrief): string {
  if (!brief) return "";
  const lines = [
    brief.sContent && `- S size shows: ${brief.sContent}`,
    brief.mContent && `- M size shows: ${brief.mContent}`,
    brief.lContent && `- L size shows: ${brief.lContent}`,
    brief.dataSource && `- Data source: ${brief.dataSource}`,
    brief.dataShape && `- Data shape: ${brief.dataShape}`,
    brief.notes && `- Additional notes: ${brief.notes}`,
  ].filter(Boolean);
  if (lines.length === 0) return "";
  return `\n## Additional context carried over from Plan\n\n${lines.join("\n")}\n`;
}

function buildIdeatePrompt(opts: {
  sessionDir: string;
  prompt: string;
  count: number;
  startIndex: number;
  regenerateIndex?: number;
  existingContent?: string;
  brief?: WidgetBrief;
}): string {
  const { sessionDir, prompt, count, startIndex, regenerateIndex, existingContent, brief } = opts;
  const contextSection = briefContextSection(brief);

  const sharedRules = `These are throwaway visual mockups for brainstorming a future AVN Hub dashboard widget — NOT real components. Each file must be a complete, standalone HTML document that opens directly in a browser with no build step, no external JS framework, and no network calls other than the Google Fonts link below.

Match the AVN Hub "chunky sticker card" dark aesthetic exactly — reuse this CSS/fonts verbatim as your starting point (extend it, don't replace the tokens or fonts):

${STYLE_REFERENCE}

Rules:
- Use ONLY the CSS custom properties already defined above for colors — no other hex values.
- Border radius 12-16px, 1.5px solid border, hard-offset box-shadow (no blur) — the "sticker" look.
- Any motion must be CSS \`@keyframes\`/\`transition\` only. Inline \`<script>\` is allowed ONLY for simple stateful interactions (e.g. toggling a class on click) — never an external script, never a framework.
- DotGothic16 for labels/headline numbers, JetBrains Mono for data values and body text.
- Show the concept inside one or more \`.block\` cards with a \`.block-label\` header (icon + uppercase label), matching the reference markup shape.`;

  if (regenerateIndex) {
    return `${sharedRules}
${contextSection}
## Your task — revising one existing mockup

Overwrite \`${join(sessionDir, variationFile(regenerateIndex))}\` (use this exact absolute path) with a revised version of the mockup below, per this instruction: ${prompt}

Do NOT write any other file. Do NOT touch any other variation.

## Current version (revise this)

\`\`\`html
${existingContent || "(could not read the existing file — write a corrected version from scratch based on the instruction above)"}
\`\`\`

Start writing the file now.`;
  }

  const fileList = Array.from({ length: count }, (_, i) => join(sessionDir, variationFile(startIndex + i))).join("\n");

  return `${sharedRules}
${contextSection}
## Your task — generating ${count} variation${count > 1 ? "s" : ""}

Concept: ${prompt}

Write exactly ${count} separate, complete HTML files at these exact absolute paths:
${fileList}

${count > 1 ? "Make the variations meaningfully different from each other in layout/approach — not just minor color or spacing tweaks." : ""}

Start writing the files now.`;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    sessionId: string;
    prompt: string;
    count?: number;
    /** lowest variation number to write this round — caller tracks this so
        repeated rounds in the same session never overwrite earlier ones */
    startIndex?: number;
    regenerateIndex?: number;
    harness?: HarnessId;
    harnessChain?: HarnessId[];
    /** the project's Plan-mode brief, if any — folds per-size/data fields
        into the mockup prompt beyond just the one-line concept text */
    brief?: WidgetBrief;
  };
  const { sessionId, prompt, regenerateIndex, harness: bodyHarness, harnessChain: bodyChain, brief } = body;
  const count = Math.min(Math.max(Math.trunc(body.count ?? 3), 1), 6);
  const startIndex = Math.min(Math.max(Math.trunc(body.startIndex ?? 1), 1), 1000);

  if (!isValidIdeateSessionId(sessionId)) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message: "invalid session id" })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }
  if (!prompt?.trim()) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message: "prompt is required" })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const sessionDir = sessionDirFor(sessionId);
  mkdirSync(sessionDir, { recursive: true });

  let existingContent: string | undefined;
  if (regenerateIndex) {
    try {
      existingContent = readFileSync(join(sessionDir, variationFile(regenerateIndex)), "utf-8");
    } catch {
      existingContent = undefined;
    }
  }

  const fullPrompt = buildIdeatePrompt({ sessionDir, prompt: prompt.trim(), count, startIndex, regenerateIndex, existingContent, brief });

  const requestedHarness: HarnessId = bodyHarness ?? "claude";
  const chain: HarnessId[] = bodyChain ?? HARNESS_CHAIN_DEFAULT;

  // Same single-generation mutex as the generate route — a mockup run and a
  // build run (or two mockup runs from different tabs) still race on the repo.
  const lock = acquireGenerationLock("ideate");
  if (!lock.ok) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message: describeBusyError(lock.holder, lock.ageMs) })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
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

      // On a mid-run harness switch, hand the fallback whatever variation
      // files already exist so it resumes from them instead of re-reading.
      const expectedFiles = regenerateIndex
        ? [variationFile(regenerateIndex)]
        : Array.from({ length: count }, (_, i) => variationFile(startIndex + i));
      const partialWork = () =>
        expectedFiles
          .filter((f) => existsSync(join(sessionDir, f)))
          .map((f) => `<!-- ${f} -->\n${readFileSync(join(sessionDir, f), "utf-8")}`)
          .join("\n\n");

      const { outcome } = await runHarnessChain(fullPrompt, requestedHarness, chain, write, abortController.signal, partialWork);

      // "aborted" (user stop) deliberately skips the done-verification below —
      // a stopped run reporting "no variation files found" would be noise.
      if (outcome === "done") {
        // Verify what was actually written rather than trusting the harness's
        // claim — same discipline as the real generate route's
        // findComponentModule() check. Check the exact expected filenames
        // (not a directory scan) so an earlier round's files in the same
        // session dir are never mistaken for this round's output.
        const expected = regenerateIndex
          ? [variationFile(regenerateIndex)]
          : Array.from({ length: count }, (_, i) => variationFile(startIndex + i));
        const written = expected.filter((f) => existsSync(join(sessionDir, f)));

        if (written.length === 0) {
          sendEvent(write, "error", { message: "mockup generation finished but no variation files were found on disk" });
        } else {
          if (written.length < expected.length) {
            sendEvent(write, "status", { type: "partial", missing: expected.filter((f) => !written.includes(f)) });
          }
          sendEvent(write, "status", { type: "done", variations: written });
        }
      }

      } finally {
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

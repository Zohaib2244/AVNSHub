// Shared SSE-streaming harness spawn logic, used by both the real widget
// generate route and the Ideate-mode mockup route — the only difference
// between callers is the prompt text and what they do with the files
// afterward (tsc + registry vs. nothing).
import { spawn } from "child_process";
import { HARNESS_ADAPTERS, type HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { lineSignalsLimit, type LimitReason } from "@/lib/widget-creator/limitDetection";

const REPO_ROOT = process.cwd();

export type SSEWriter = (data: string) => void;

export function sendEvent(write: SSEWriter, event: string, payload: Record<string, unknown>) {
  write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export function runHarness(
  adapter: (typeof HARNESS_ADAPTERS)[HarnessId],
  prompt: string,
  write: SSEWriter,
  signal: AbortSignal,
  continuationNote?: string,
): Promise<{ status: "done" | "limit" | "error"; limitReason?: LimitReason }> {
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

    let limitReason: LimitReason = null;
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

      if (!isGeneratedContent) {
        const reason = lineSignalsLimit(line);
        if (reason && !limitReason) limitReason = reason;
        if (reason) return;
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
      const reason = lineSignalsLimit(text);
      if (reason && !limitReason) limitReason = reason;
    });

    child.on("close", () => {
      if (buffer) processLine(buffer);
      resolve(limitReason ? { status: "limit", limitReason } : { status: "done" });
    });

    child.on("error", (err) => {
      const hint = (err as NodeJS.ErrnoException).code === "ENOENT"
        ? ` — is the "${adapter.command}" CLI installed and on PATH?`
        : "";
      sendEvent(write, "error", { message: `Failed to start ${adapter.id}: ${err.message}${hint}` });
      resolve({ status: "error" });
    });

    signal.addEventListener("abort", () => {
      child.kill("SIGTERM");
    });
  });
}

/** Run the harness fallback chain against one prompt, calling `onDone` once a
    harness finishes cleanly (no limit/error). Shared turn-by-turn fallback
    loop used by both the generate and ideate routes.

    `partialWork`, if given, is read at each switch and its return value is
    embedded verbatim into the next harness's continuation note — so a fallback
    picking up after a limit continues from the exact on-disk file contents
    instead of spending a burst of Read/find/grep/git calls re-discovering what
    the previous harness already wrote. Return "" when nothing was written yet
    (the note then falls back to the generic "inspect the partial output" text). */
export async function runHarnessChain(
  fullPrompt: string,
  requestedHarness: HarnessId,
  chain: HarnessId[],
  write: SSEWriter,
  signal: AbortSignal,
  partialWork?: () => string,
): Promise<"done" | "failed"> {
  const startIdx = chain.indexOf(requestedHarness);
  const orderedChain = startIdx >= 0 ? [...chain.slice(startIdx), ...chain.slice(0, startIdx)] : chain;

  let continuationNote: string | undefined;

  for (let i = 0; i < orderedChain.length; i++) {
    const harnessId = orderedChain[i];
    const adapter = HARNESS_ADAPTERS[harnessId];
    if (!adapter) continue;

    const { status, limitReason } = await runHarness(adapter, fullPrompt, write, signal, continuationNote);

    if (status === "limit" || status === "error") {
      const nextId = orderedChain[i + 1];
      if (nextId) {
        const reason = status === "limit"
          ? (limitReason === "quota" ? "rate limit / quota reached" : limitReason === "overload" ? "upstream service overloaded (not your quota)" : "unknown")
          : "failed to start";
        sendEvent(write, "switch", { from: harnessId, to: nextId, reason });
        if (status === "limit") {
          // A limit means the previous CLI actually ran and may have written
          // partial work. Hand that work to the fallback inline so it doesn't
          // re-read it from disk. (A "failed to start" never touched disk, so
          // there is nothing to carry — leave the note undefined.)
          const partial = partialWork?.().trim();
          continuationNote = partial
            ? `The previous harness (${harnessId}) started but hit: ${reason}. It had already written the file(s) below. CONTINUE from this exact on-disk state and finish the remaining work — do NOT re-read these from disk, do NOT restart from scratch:\n\n${partial}`
            : `The previous harness (${harnessId}) started but hit: ${reason}. Inspect the partial output already written to disk and CONTINUE from where it stopped.`;
        } else {
          continuationNote = undefined;
        }
        continue;
      }
      if (status === "limit") {
        sendEvent(write, "error", { message: `All harnesses hit a limit (${limitReason ?? "unknown"}). Try again later.` });
      }
      return "failed";
    }
    return "done";
  }
  return "failed";
}

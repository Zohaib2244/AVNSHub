// Shared SSE-streaming harness spawn logic, used by both the real widget
// generate route and the Ideate-mode mockup route — the only difference
// between callers is the prompt text and what they do with the files
// afterward (tsc + registry vs. nothing).
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { HARNESS_ADAPTERS, type HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { lineSignalsLimit, type LimitReason } from "@/lib/widget-creator/limitDetection";

const REPO_ROOT = process.cwd();

export type SSEWriter = (data: string) => void;

export function sendEvent(write: SSEWriter, event: string, payload: Record<string, unknown>) {
  write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

// --- Session ID extraction (mirrors lib/nutbot/chatHarness.ts) ---
// Scans non-content JSON frames emitted by the claude CLI for a UUID nested
// under session/conversation keys. This lets the caller round-trip the ID
// back to the browser so the next refinement turn can use --resume instead
// of re-sending the entire task prompt + authoring guide.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_KEYS = new Set(["session_id", "sessionId", "conversation_id", "conversationId"]);

function findSessionId(value: unknown, depth = 0): string | null {
  if (depth > 3 || value == null) return null;
  if (typeof value === "string") return UUID_RE.test(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSessionId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  for (const key of SESSION_KEYS) {
    const found = findSessionId(rec[key], depth + 1);
    if (found) return found;
  }
  for (const [k, v] of Object.entries(rec)) {
    if (!/(session|conversation)/i.test(k)) continue;
    const found = findSessionId(v, depth + 1);
    if (found) return found;
  }
  return null;
}

function extractSessionIdFromLine(line: string): string | null {
  try { return findSessionId(JSON.parse(line)); } catch { return null; }
}

// --- Per-run options (only meaningful for the claude adapter) ---
export type HarnessOpts = {
  /** Existing session ID — causes claude to use --resume instead of -p so
      the model continues from its prior context. */
  sessionId?: string;
  /** Short user instruction for resume turns. Replaces `prompt` when
      sessionId is set and this is provided — the model already has full
      context (including the avn-widget-build skill, loaded on turn 1). */
  resumePrompt?: string;
};

export function runHarness(
  adapter: (typeof HARNESS_ADAPTERS)[HarnessId],
  prompt: string,
  write: SSEWriter,
  signal: AbortSignal,
  continuationNote?: string,
  opts?: HarnessOpts,
): Promise<{ status: "done" | "limit" | "error"; limitReason?: LimitReason; newSessionId?: string }> {
  return new Promise((resolve) => {
    const isResume = adapter.id === "claude" && Boolean(opts?.sessionId);

    // Resume turn → short instruction only (model already has full context
    // from turn 1, including the avn-widget-build skill it loaded then).
    // Everything else → full prompt.
    const activePrompt = isResume && opts?.resumePrompt != null ? opts.resumePrompt : prompt;

    const sendablePrompt = continuationNote
      ? `${continuationNote}\n\n${activePrompt}`
      : activePrompt;

    sendEvent(write, "status", { type: "harness_start", harness: adapter.id });

    // Build args — claude gets dynamic session/system-prompt flags;
    // codex/opencode use their static adapter.args unchanged.
    let args: string[];
    if (adapter.id === "claude") {
      if (isResume) {
        // Continue an existing session. The model already has the authoring
        // guide and full widget spec from turn 1, so sendablePrompt is just
        // the new user instruction (~50 tokens vs ~6K).
        args = [
          "-p",
          "--resume", opts!.sessionId!,
          "--output-format", "stream-json",
          "--verbose",
          "--permission-mode", "bypassPermissions",
        ];
      } else {
        // First turn — mint a session ID so the next refinement can resume.
        args = [
          "-p",
          "--session-id", randomUUID(),
          "--output-format", "stream-json",
          "--verbose",
          "--permission-mode", "bypassPermissions",
        ];
      }
    } else if (adapter.promptViaArg) {
      args = [...adapter.args, sendablePrompt];
    } else {
      args = [...adapter.args];
    }

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
      child.stdin.write(sendablePrompt);
      child.stdin.end();
    }

    let limitReason: LimitReason = null;
    let newSessionId: string | null = null;
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
        // Extract session ID from non-content frames (result/system frames)
        // so the browser can use --resume on the next refinement turn.
        if (adapter.id === "claude" && !newSessionId) {
          const sid = extractSessionIdFromLine(line);
          if (sid) newSessionId = sid;
        }
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
      resolve(
        limitReason
          ? { status: "limit", limitReason }
          : { status: "done", newSessionId: newSessionId ?? undefined },
      );
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

/** Run the harness fallback chain.
 *
 *  `opts` (session resume) applies ONLY to the first harness. Fallback
 *  harnesses always receive the full prompt with no session context — they
 *  don't share session state with the harness that hit the limit.
 *
 *  `partialWork`, if given, is read at each switch and embedded into the
 *  continuation note so a fallback continues from the exact on-disk file state
 *  instead of re-discovering it with a burst of Read/find/grep/git calls.
 *
 *  Returns the claude session ID (if one was captured) so the browser can send
 *  it back on the next refinement turn to use --resume. */
export async function runHarnessChain(
  fullPrompt: string,
  requestedHarness: HarnessId,
  chain: HarnessId[],
  write: SSEWriter,
  signal: AbortSignal,
  partialWork?: () => string,
  opts?: HarnessOpts,
): Promise<{ outcome: "done" | "failed"; sessionId?: string }> {
  const startIdx = chain.indexOf(requestedHarness);
  const orderedChain = startIdx >= 0 ? [...chain.slice(startIdx), ...chain.slice(0, startIdx)] : chain;

  let continuationNote: string | undefined;
  let capturedSessionId: string | undefined;

  for (let i = 0; i < orderedChain.length; i++) {
    const harnessId = orderedChain[i];
    const adapter = HARNESS_ADAPTERS[harnessId];
    if (!adapter) continue;

    // opts (session resume) only apply to the first harness. Fallback
    // harnesses always start fresh with the full prompt.
    const harnessOpts = i === 0 ? opts : undefined;

    const { status, limitReason, newSessionId } = await runHarness(
      adapter, fullPrompt, write, signal, continuationNote, harnessOpts,
    );

    if (newSessionId) capturedSessionId = newSessionId;

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
      return { outcome: "failed" };
    }
    return { outcome: "done", sessionId: capturedSessionId };
  }
  return { outcome: "failed" };
}

// Shared SSE-streaming harness spawn logic, used by both the real widget
// generate route and the Ideate-mode mockup route — the only difference
// between callers is the prompt text and what they do with the files
// afterward (tsc + registry vs. nothing).
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { readdirSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { HARNESS_ADAPTERS, type HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { lineSignalsLimit, lineSignalsSandboxFailure, describeLimitReason, type LimitReason } from "@/lib/widget-creator/limitDetection";

import { modelArgs, DEFAULT_MODELS, type ModelDefaults } from "./models";
import { readModelDefaults, saveUsage, resolveSession, saveSession } from "./runStore";
import { EMPTY_USAGE, parseUsage, type UsageRun } from "./usage";
import { requestSwitch } from "./switchApproval";

const REPO_ROOT = process.cwd();

export type SSEWriter = (data: string) => void;

export function sendEvent(write: SSEWriter, event: string, payload: Record<string, unknown>) {
  write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function windowsPromptFileArg(sendablePrompt: string) {
  const promptPath = join(tmpdir(), `avnhub-prompt-${randomUUID()}.md`);
  writeFileSync(promptPath, sendablePrompt, "utf8");
  return {
    promptPath,
    arg: `Read the UTF-8 prompt file at this exact path and follow the instructions in it exactly: ${promptPath}`,
  };
}

// --- Session ID extraction (mirrors lib/nutbot/chatHarness.ts) ---
// Scans non-content JSON frames emitted by the claude CLI for a UUID nested
// under session/conversation keys. This lets the caller round-trip the ID
// back to the browser so the next refinement turn can use --resume instead
// of re-sending the entire task prompt + authoring guide.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_KEYS = new Set(["session_id", "sessionId", "conversation_id", "conversationId", "thread_id", "threadId"]);

// Matches the normalized "[tool: Read] some/path" text every adapter's
// parseChunk already produces for a Read/Glob/Grep call (case-insensitive —
// claude capitalizes tool names, opencode lowercases them).
const SIBLING_READ_RE = /^\[tool: (read|glob|grep)\]\s*(.+)$/i;

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

// --- Per-run model, stage and provider-specific session options ---
export type HarnessOpts = {
  models?: ModelDefaults;
  stage?: UsageRun["stage"];
  /** Existing session ID — causes claude to use --resume instead of -p so
      the model continues from its prior context. */
  sessionId?: string;
  /** Short user instruction for resume turns. Replaces `prompt` when
      sessionId is set and this is provided — the model already has full
      context (including the avn-widget-build skill, loaded on turn 1). */
  resumePrompt?: string;
  /** working directory for the CLI — the widget's workbench for generate
      runs (see workbench.ts); defaults to the repo root */
  cwd?: string;
};

/** widget folders under `root`'s components/widgets/custom other than `slug` */
function listSiblingWidgetDirs(root: string, slug: string): string[] {
  try {
    return readdirSync(join(root, "components", "widgets", "custom"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== slug)
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export function runHarness(
  adapter: (typeof HARNESS_ADAPTERS)[HarnessId],
  prompt: string,
  write: SSEWriter,
  signal: AbortSignal,
  continuationNote?: string,
  opts?: HarnessOpts,
  /** The widget slug this run is scoped to (its own folder under
      components/widgets/custom/) — used to (a) scope claude's own tool
      permissions away from sibling widget folders, and (b) flag, for every
      adapter, when a Read/Glob/Grep targets a *different* widget's folder
      even though the prompt already says not to. */
  watchSlug?: string,
): Promise<{
  status: "done" | "limit" | "error" | "aborted";
  limitReason?: LimitReason;
  errorReason?: string;
  newSessionId?: string;
  /** the harness's last piece of prose output — surfaced by callers that
      verify the run's on-disk result, so "the harness claimed done but wrote
      nothing" can quote its own explanation instead of just asserting it */
  lastText?: string;
}> {
  return new Promise((resolve) => {
    let tempPromptPath: string | undefined;

    const cleanupTempPrompt = () => {
      if (!tempPromptPath) return;
      const path = tempPromptPath;
      tempPromptPath = undefined;
      try { unlinkSync(path); } catch {}
    };

    const isResume = (adapter.id === "claude" || adapter.id === "codex") && Boolean(opts?.sessionId);
    const choice = (opts?.models ?? DEFAULT_MODELS)[adapter.id];
    const startedAt = new Date().toISOString();
    let usage = { ...EMPTY_USAGE };
    let actualModel = choice.model || "CLI default (not reported)";
    let recorded = false;
    const record = (status: UsageRun["status"]) => {
      if (recorded) return;
      recorded = true;
      const run: UsageRun = { ...usage, id: randomUUID(), startedAt, durationMs: Date.now() - Date.parse(startedAt), harness: adapter.id, model: actualModel, stage: opts?.stage ?? "build", status };
      sendEvent(write, "usage", run);
      void saveUsage(run);
    };

    // Resume turn → short instruction only (model already has full context
    // from turn 1, including the avn-widget-build skill it loaded then).
    // Everything else → full prompt.
    const activePrompt = isResume && opts?.resumePrompt != null ? opts.resumePrompt : prompt;

    const sendablePrompt = continuationNote
      ? `${continuationNote}\n\n${activePrompt}`
      : activePrompt;

    sendEvent(write, "status", { type: "harness_start", harness: adapter.id });

    // Build args — claude gets dynamic session/system-prompt flags;
    // Codex also supports sessions and model flags; OpenCode retains its adapter args.
    let args: string[];
    if (adapter.id === "claude") {
      // Deny Read/Glob/Grep on every *other* widget's folder, by name — on
      // top of bypassPermissions, which skips the interactive "ask" step but
      // still respects an explicit deny list. This used to be one blanket
      // deny on components/widgets/custom/** plus an allow for this run's own
      // folder, but deny always beats allow, and claude treats a Read deny as
      // blocking writes too ("File is covered by a Read deny rule ... cannot
      // be written"), so the harness couldn't write its own widget at all.
      // In a workbench (see workbench.ts) sibling folders aren't mirrored, so
      // this list is empty and no flags are passed. codex/opencode have no
      // equivalent flag — see the sibling-read detection in processLine.
      const siblingDirs = watchSlug ? listSiblingWidgetDirs(opts?.cwd ?? REPO_ROOT, watchSlug) : [];
      const toolScope = siblingDirs.length ? [
        "--disallowedTools",
        ...siblingDirs.flatMap((name) => [
          `Read(./components/widgets/custom/${name}/**)`,
          `Glob(./components/widgets/custom/${name}/**)`,
          `Grep(./components/widgets/custom/${name}/**)`,
        ]),
      ] : [];
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
          ...toolScope,
        ];
      } else {
        // First turn — mint a session ID so the next refinement can resume.
        args = [
          "-p",
          "--session-id", randomUUID(),
          "--output-format", "stream-json",
          "--verbose",
          "--permission-mode", "bypassPermissions",
          ...toolScope,
        ];
      }
    } else if (adapter.id === "codex") {
      // -C/--cd is codex's own working root. Passing cwd to spawn is not
      // enough for every CLI (opencode has --dir for the same reason): a
      // harness that resolves paths against something other than the process
      // cwd would write into the live tree instead of the workbench.
      const root = opts?.cwd ? ["-C", opts.cwd] : [];
      args = isResume
        ? ["exec", "--sandbox", "workspace-write", ...root, "resume", "--json", ...modelArgs(adapter.id, choice), opts!.sessionId!, "-"]
        : [...adapter.args, ...root, ...modelArgs(adapter.id, choice)];
    } else if (adapter.id === "opencode") {
      // --dir is opencode's working root (see the codex note above)
      const root = opts?.cwd ? ["--dir", opts.cwd] : [];
      args = [...adapter.args, ...root, sendablePrompt];
      if (process.platform === "win32") {
        try {
          const promptFile = windowsPromptFileArg(sendablePrompt);
          tempPromptPath = promptFile.promptPath;
          args = [...adapter.args, ...root, promptFile.arg];
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendEvent(write, "error", { message: `Failed to prepare ${adapter.id} prompt file: ${message}` });
          resolve({ status: "error" });
          return;
        }
      }
    } else if (adapter.promptViaArg) {
      if (process.platform === "win32") {
        // Plain NutBot chat's opencode path has the same promptViaArg bug
        // class; this fix is scoped to Widget Creator generation/ideation.
        try {
          const promptFile = windowsPromptFileArg(sendablePrompt);
          tempPromptPath = promptFile.promptPath;
          args = [...adapter.args, promptFile.arg];
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendEvent(write, "error", { message: `Failed to prepare ${adapter.id} prompt file: ${message}` });
          resolve({ status: "error" });
          return;
        }
      } else {
        args = [...adapter.args, sendablePrompt];
      }
    } else {
      args = [...adapter.args];
    }

    if (adapter.id === "claude") args.push(...modelArgs(adapter.id, choice));
    if (signal.aborted) { record("aborted"); resolve({ status: "aborted" }); return; }
    const child = spawn(adapter.command, args, {
      cwd: opts?.cwd ?? REPO_ROOT,
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
    let stderrTail = "";
    let lastText = "";
    // Set once the sandbox-failure kill has been issued, so the remaining
    // buffered lines don't each try to kill the child again.
    let sandboxKilled = false;

    function processLine(line: string) {
      // Checked before (and outside) the isGeneratedContent gate below: a
      // broken sandbox reports itself inside the harness's own command-output
      // frames, which that gate deliberately skips. Every command will fail
      // the same way, so stop the run now rather than paying for a full turn
      // that cannot touch the disk — the chain then offers the next harness.
      if (!sandboxKilled && lineSignalsSandboxFailure(line)) {
        sandboxKilled = true;
        limitReason = "sandbox";
        child.kill("SIGTERM");
      }
      const reported = parseUsage(adapter.id, line);
      if (reported) { usage = reported.usage; actualModel = reported.model ?? actualModel; }
      // Skip limit detection on frames carrying actual model/tool content —
      // generated code can legitimately mention "rate limit", "overloaded",
      // etc. as plain text, and checking the raw JSON-encoded line would fire
      // a false positive switch. Covers all three adapters' content frames:
      // claude (message.content), codex (item), opencode (part).
      let isGeneratedContent = false;
      try {
        const f = JSON.parse(line);
        isGeneratedContent = Boolean(f.message?.content) || Boolean(f.item) || Boolean(f.part);
        // Claude Code (2.1.x) emits a rate_limit_event status frame on every
        // run, normally with status "allowed". Its type name alone matched
        // the /rate.?limit/ quota pattern, so every successful claude turn
        // ended as "All harnesses hit a limit (quota)". Only a rejected
        // status is a real limit.
        if (f.type === "rate_limit_event") {
          if (f.rate_limit_info?.status === "rejected" && !limitReason) limitReason = "quota";
          return;
        }
      } catch {}

      if (!isGeneratedContent) {
        const reason = lineSignalsLimit(line);
        if (reason && !limitReason) limitReason = reason;
        if (reason) return;
        // Extract session ID from non-content frames (result/system frames)
        // so the browser can use --resume on the next refinement turn.
        if ((adapter.id === "claude" || adapter.id === "codex") && !newSessionId) {
          const sid = extractSessionIdFromLine(line);
          if (sid) newSessionId = sid;
        }
      }
      const text = adapter.parseChunk(line);
      if (text) {
        // Every adapter's parseChunk already normalizes tool calls to the
        // same "[tool: Name] detail" text (see formatToolUse / opencode's
        // equivalent in harnessAdapters.ts) before this point, so sibling-read
        // detection can be adapter-agnostic instead of re-parsing each CLI's
        // raw JSON shape — this is what actually makes it work uniformly
        // across claude, codex, and opencode. (Codex currently doesn't
        // surface Read/Glob/Grep as tool-use text at all, so this only fires
        // in practice for claude/opencode until that's added.)
        if (watchSlug) {
          const m = SIBLING_READ_RE.exec(text.trim());
          if (m) {
            const path = m[2];
            const marker = "components/widgets/custom/";
            const idx = path.indexOf(marker);
            if (idx !== -1) {
              const otherSlug = path.slice(idx + marker.length).split("/")[0];
              if (otherSlug && otherSlug !== watchSlug) {
                sendEvent(write, "sibling_read", { tool: m[1], path, slug: otherSlug });
              }
            }
          }
        }
        sendEvent(write, "chunk", { text });
        // Tool-call lines are normalized to "[tool: Name] ..." by every
        // adapter's parseChunk; keep only real prose so lastText is the
        // harness's own explanation, not the last file it happened to read.
        if (!text.trimStart().startsWith("[tool:")) lastText = text.trim() || lastText;
      }
    }

    child.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });

    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      stderrTail = (stderrTail + text).slice(-2000);
      if (!sandboxKilled && lineSignalsSandboxFailure(text)) {
        sandboxKilled = true;
        limitReason = "sandbox";
        child.kill("SIGTERM");
        return;
      }
      const reason = lineSignalsLimit(text);
      if (reason && !limitReason) limitReason = reason;
    });

    child.on("close", (code, killSignal) => {
      cleanupTempPrompt();
      if (buffer) processLine(buffer);
      // Order matters: an aborted child also exits nonzero — if the exit-code
      // branch ran first, a user pressing stop would be treated as a harness
      // failure and spawn the next harness in the chain.
      if (signal.aborted) {
        record("aborted");
        resolve({ status: "aborted", lastText });
      } else if (limitReason) {
        record("limit");
        resolve({ status: "limit", limitReason, lastText });
      } else if (code !== 0) {
        record("error");
        // code === null means killed by an external signal (not our abort)
        resolve({ status: "error", errorReason: `exited with ${code !== null ? `code ${code}` : `signal ${killSignal}`}${stderrTail.trim() ? `: ${stderrTail.trim()}` : ""}`, lastText });
      } else {
        record("done");
        resolve({ status: "done", newSessionId: newSessionId ?? undefined, lastText });
      }
    });

    child.on("error", (err) => {
      record("error");
      cleanupTempPrompt();
      const hint = (err as NodeJS.ErrnoException).code === "ENOENT"
        ? ` — is the "${adapter.command}" CLI installed and on PATH?`
        : "";
      sendEvent(write, "error", { message: `Failed to start ${adapter.id}: ${err.message}${hint}` });
      resolve({ status: "error" });
    });

    const abort = () => { child.kill("SIGTERM"); };
    signal.addEventListener("abort", abort, { once: true });
    child.once("close", () => signal.removeEventListener("abort", abort));
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
 *  Returns the provider session ID (if captured) so the browser can send
 *  it back on the next refinement turn to use --resume. */
export async function runHarnessChain(
  fullPrompt: string,
  requestedHarness: HarnessId,
  chain: HarnessId[],
  write: SSEWriter,
  signal: AbortSignal,
  partialWork?: () => string,
  opts?: HarnessOpts,
  /** widget slug this whole chain is scoped to — see runHarness's watchSlug */
  watchSlug?: string,
): Promise<{ outcome: "done" | "failed" | "aborted"; sessionId?: string; harness?: HarnessId; lastText?: string }> {
  const models = opts?.models ?? await readModelDefaults();
  const validSession = await resolveSession(opts?.sessionId, requestedHarness, models[requestedHarness]?.model ?? "");
  const orderedChain = [requestedHarness, ...chain.filter((id) => id !== requestedHarness)].filter((id, i, ids) => Object.hasOwn(HARNESS_ADAPTERS, id) && ids.indexOf(id) === i);

  let continuationNote: string | undefined;
  let capturedSessionId: string | undefined;
  // Tracks whether the one-time same-harness retry (below) has already
  // happened, so a genuinely broken harness still falls through to the next
  // one instead of retrying forever.
  let resumeRetried = false;

  for (let i = 0; i < orderedChain.length; i++) {
    const harnessId = orderedChain[i];
    const adapter = HARNESS_ADAPTERS[harnessId];
    if (!adapter) continue;

    // opts (session resume) only apply to the first harness, and only until
    // the resume-retry below (if any) has consumed it once.
    // cwd applies to every harness in the chain — a fallback must keep
    // writing into the same workbench, never the live tree.
    const harnessOpts = { ...(i === 0 && !resumeRetried ? { ...opts, sessionId: validSession } : {}), models, stage: opts?.stage, cwd: opts?.cwd };

    const { status, limitReason, errorReason, newSessionId, lastText } = await runHarness(
      adapter, fullPrompt, write, signal, continuationNote, harnessOpts, watchSlug,
    );

    if (newSessionId) {
      capturedSessionId = newSessionId;
      await saveSession(newSessionId, harnessId, models[harnessId].model);
    }

    // User stop — terminal. No switch/error events, and critically no
    // fallback: pressing stop must never spawn the next harness.
    if (status === "aborted") return { outcome: "aborted", lastText };

    // A `--resume` attempt that fails to even run often just means the CLI's
    // own session store expired (e.g. picking an edit back up weeks later) —
    // not that this harness can't do the job. Retry it once, fresh, with the
    // full prompt (no session) before falling through to a different,
    // possibly weaker, harness in the chain.
    if (status === "error" && harnessOpts?.sessionId && !resumeRetried) {
      resumeRetried = true;
      sendEvent(write, "status", { type: "harness_start", harness: harnessId });
      i--;
      continue;
    }

    if (status === "limit" || status === "error") {
      const nextId = orderedChain[i + 1];
      if (nextId) {
        const reason = status === "limit"
          ? describeLimitReason(limitReason ?? null)
          : errorReason ?? "failed to start";
        const approved = await requestSwitch(signal, (id) => sendEvent(write, "switch_required", {
          id, from: harnessId, to: nextId, reason, model: models[nextId].model || "CLI default",
        }));
        if (!approved || signal.aborted) {
          sendEvent(write, "error", { message: "Provider switch cancelled or expired. Partial work is preserved; retry or choose a provider in model settings." });
          return { outcome: "aborted" };
        }
        sendEvent(write, "switch", { from: harnessId, to: nextId, reason });
        if (limitReason === "sandbox") {
          // Nothing was written — the sandbox blocked every command — so the
          // fallback must start clean rather than hunt for partial output.
          continuationNote = `The previous harness (${harnessId}) could not execute a single command on this machine (${reason}) and wrote nothing to disk. Start the task from scratch.`;
        } else if (status === "limit" || errorReason) {
          // The previous CLI actually ran (limit, or started-then-crashed) and
          // may have written partial work. Hand that work to the fallback
          // inline so it doesn't re-read it from disk. (A "failed to start"
          // never touched disk, so there is nothing to carry.)
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
        sendEvent(write, "error", {
          message: limitReason === "sandbox"
            ? `${harnessId} could not execute any command on this machine (${describeLimitReason(limitReason)}), and no other harness is left to try.`
            : `All harnesses hit a limit (${limitReason ?? "unknown"}). Try again later.`,
        });
      } else if (errorReason) {
        // Chain exhausted on a crash — previously this path ended silently
        // and the client stream just stopped with no explanation.
        sendEvent(write, "error", { message: `All harnesses failed (last: ${harnessId} ${errorReason}). Check the CLI installs and try again.` });
      }
      return { outcome: "failed" };
    }
    return { outcome: "done", sessionId: capturedSessionId, harness: harnessId, lastText };
  }
  return { outcome: "failed" };
}

import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { randomUUID } from "crypto";
import { homedir } from "os";
import { HARNESS_ADAPTERS, type HarnessId } from "@/lib/widget-creator/harnessAdapters";

import { modelArgs, type ModelChoice } from "@/lib/widget-creator/models";
import { saveUsage, saveSession } from "@/lib/widget-creator/runStore";
import { EMPTY_USAGE, parseUsage, type UsageRun } from "@/lib/widget-creator/usage";

export type ChatMode = "chill" | "work";

type StreamHarnessChatOptions = {
  mode?: ChatMode;
  modelChoice?: ModelChoice;
  stage?: "chat" | "plan";
  harness: HarnessId;
  message: string;
  sessionId?: string | null;
  persona: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
};

type Invocation = {
  args: string[];
  prompt: string;
  promptViaArg?: boolean;
  initialConversationId?: string;
  cwd?: string;
};

const REPO_ROOT = process.cwd();
// Work mode runs where an ssh session would land, so the CLI loads the user's
// global CLAUDE.md + memory for this host rather than the repo's. Resumes must
// use the same cwd — claude keys its session transcripts by project dir.
const WORK_ROOT = homedir();
const TOOL_LINE_RE = /(\[tool: [^\]]+\][^\n]*\n?)/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_KEYS = new Set(["session_id", "sessionId", "conversation_id", "conversationId", "thread_id", "threadId"]);

function ndjson(type: string, data: unknown) {
  return `${JSON.stringify({ type, data })}\n`;
}

function chatPrompt(persona: string, message: string, history: Array<{ role: "user" | "assistant"; text: string }> = []) {
  const recent = history
    .slice(-8)
    .map((entry) => `${entry.role === "assistant" ? "NutBot" : "User"}: ${entry.text}`)
    .join("\n");

  return `${persona}

Reply as NutBot in plain chat mode. Do not edit files, run shell commands, browse the web, or use tools.

${recent ? `Recent conversation:\n${recent}\n\n` : ""}
User message:
${message}`;
}

function workPrompt(persona: string, message: string, history: Array<{ role: "user" | "assistant"; text: string }> = []) {
  const recent = history
    .slice(-8)
    .map((entry) => `${entry.role === "assistant" ? "NutBot" : "User"}: ${entry.text}`)
    .join("\n");

  return `${persona ? `${persona}\n\n` : ""}${recent ? `Recent conversation:\n${recent}\n\n` : ""}User request:
${message}`;
}

// Full agent turn: tools on, no permission prompts (a -p run has nobody to
// answer them), host-wide filesystem. The approval gate for state changes is
// conversational — NUTBOT_WORK_PROMPT makes the agent stop and ask. The chat
// route has no auth of its own; the hub is meant to sit behind a login proxy.
function buildWorkInvocation(
  harness: HarnessId,
  message: string,
  sessionId: string | null | undefined,
  persona: string,
  history: Array<{ role: "user" | "assistant"; text: string }> = [],
): Invocation {
  if (harness === "claude") {
    const conversationId = sessionId ?? randomUUID();
    // --append-system-prompt is not part of the saved session, so it rides on
    // every turn, resumes included
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "bypassPermissions",
      "--append-system-prompt",
      persona,
      ...(sessionId ? ["--resume", sessionId] : ["--session-id", conversationId]),
    ];
    return {
      args,
      prompt: sessionId ? message : workPrompt("", message, history),
      initialConversationId: conversationId,
      cwd: WORK_ROOT,
    };
  }

  if (harness === "codex") {
    const baseArgs = ["exec", "--json", "--sandbox", "danger-full-access", "--skip-git-repo-check", "-C", WORK_ROOT];
    const args = sessionId ? [...baseArgs, "resume", sessionId, "-"] : [...baseArgs, "-"];
    return {
      args,
      prompt: sessionId ? message : workPrompt(persona, message, history),
      cwd: WORK_ROOT,
    };
  }

  return {
    args: ["run", "--format", "json", "--dir", WORK_ROOT, workPrompt(persona, message, history)],
    prompt: "",
    promptViaArg: true,
    cwd: WORK_ROOT,
  };
}

function buildInvocation(
  harness: HarnessId,
  message: string,
  sessionId: string | null | undefined,
  persona: string,
  history: Array<{ role: "user" | "assistant"; text: string }> = [],
): Invocation {
  if (harness === "claude") {
    const conversationId = sessionId ?? randomUUID();
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--tools",
      "",
    ];

    // --system-prompt only on the first turn — a --resume turn already has it
    // as part of the session's own history, so resending it here would just
    // repeat the (now catalog-carrying, ~1K token) persona every single turn
    // for no benefit. Mirrors the same pattern in
    // lib/widget-creator/harnessRunner.ts's claude invocation.
    if (sessionId) {
      args.push("--resume", sessionId);
    } else {
      args.push("--system-prompt", persona, "--session-id", conversationId);
    }

    return {
      args,
      prompt: sessionId ? message : chatPrompt("", message, history),
      initialConversationId: conversationId,
    };
  }

  if (harness === "codex") {
    const baseArgs = ["exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check"];
    const args = sessionId ? [...baseArgs, "resume", sessionId, "-"] : [...baseArgs, "-"];
    return {
      args,
      prompt: sessionId ? message : chatPrompt(persona, message, history),
    };
  }

  return {
    args: ["run", "--format", "json", chatPrompt(persona, message, history)],
    prompt: "",
    promptViaArg: true,
  };
}

function findSessionId(value: unknown, depth = 0): string | null {
  if (depth > 4 || value === null || value === undefined) return null;
  if (typeof value === "string") return UUID_RE.test(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSessionId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of SESSION_KEYS) {
    const found = findSessionId(record[key], depth + 1);
    if (found) return found;
  }
  for (const [key, child] of Object.entries(record)) {
    if (!/(session|conversation|thread)/i.test(key)) continue;
    const found = findSessionId(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function extractSessionId(line: string): string | null {
  try {
    return findSessionId(JSON.parse(line));
  } catch {
    return null;
  }
}

function stderrSummary(stderr: string) {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-3).join(" ");
}

export function streamHarnessChat(options: StreamHarnessChatOptions): ReadableStream<Uint8Array> {
  const adapter = HARNESS_ADAPTERS[options.harness];
  const work = options.mode === "work";
  const invocation = (work ? buildWorkInvocation : buildInvocation)(
    options.harness,
    options.message,
    options.sessionId,
    options.persona,
    options.history,
  );
  const encoder = new TextEncoder();
  const choice = options.modelChoice ?? { model: "", effort: "default" };
  if (options.harness !== "opencode") {
    const insertAt = options.harness === "claude" ? invocation.args.length : 1;
    invocation.args.splice(insertAt, 0, ...modelArgs(options.harness, choice));
  }
  const startedAt = new Date().toISOString();
  let usage = { ...EMPTY_USAGE };
  let actualModel = choice.model || "CLI default (not reported)";
  let recorded = false;
  const record = (status: UsageRun["status"]) => {
    if (recorded) return;
    recorded = true;
    void saveUsage({ ...usage, id: randomUUID(), startedAt, durationMs: Date.now() - Date.parse(startedAt), harness: options.harness, model: actualModel, stage: options.stage ?? "chat", status });
  };
  let child: ChildProcessWithoutNullStreams | null = null;
  let finished = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let stdoutBuffer = "";
      let stderr = "";
      let conversationId = invocation.initialConversationId;
      if (conversationId) void saveSession(conversationId, options.harness, choice.model);
      let sawToken = false;

      const emit = (type: string, data: unknown) => {
        if (finished) return;
        try {
          controller.enqueue(encoder.encode(ndjson(type, data)));
        } catch {
          finished = true;
          child?.kill("SIGTERM");
        }
      };

      const close = () => {
        if (finished) return;
        finished = true;
        controller.close();
      };

      const processLine = (line: string) => {
        const reported = parseUsage(options.harness, line);
        if (reported) { usage = reported.usage; actualModel = reported.model ?? actualModel; }
        if (!line.trim()) return;
        const sessionFromFrame = extractSessionId(line);
        if (sessionFromFrame) {
          conversationId = sessionFromFrame;
          void saveSession(sessionFromFrame, options.harness, choice.model);
        }

        const text = adapter.parseChunk(line);
        if (!text) return;
        // chill mode has no tools, so a tool line there is noise; in work
        // mode each one becomes its own frame so the UI can show what the
        // agent is actually running between bursts of prose
        for (const part of text.split(TOOL_LINE_RE)) {
          if (!part) continue;
          const tool = part.match(/^\[tool: ([^\]]+)\]\s*([^\n]*)/);
          if (tool) {
            if (work) emit("tool", { name: tool[1], detail: tool[2] });
            continue;
          }
          if (!part.trim() && !sawToken) continue;
          sawToken = true;
          emit("token", part);
        }
      };

      emit("status", `starting ${adapter.label}`);

      child = spawn(adapter.command, invocation.args, {
        cwd: invocation.cwd ?? REPO_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
        shell: process.platform === "win32",
      });

      if (invocation.promptViaArg) {
        child.stdin.end();
      } else {
        child.stdin.write(invocation.prompt);
        child.stdin.end();
      }

      child.stdout.on("data", (data: Buffer) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (stdoutBuffer) processLine(stdoutBuffer);
        record(code === 0 ? "done" : "error");

        if (code !== 0) {
          const detail = stderrSummary(stderr);
          emit(
            "error",
            `${adapter.label} exited with code ${code ?? "unknown"}${detail ? `: ${detail}` : ""}`,
          );
          close();
          return;
        }

        if (!sawToken) emit("status", `${adapter.label} finished without chat text`);
        emit("done", conversationId ? { conversation_id: conversationId } : {});
        close();
      });

      child.on("error", (error) => {
        record("error");
        const hint = (error as NodeJS.ErrnoException).code === "ENOENT"
          ? ` Is the "${adapter.command}" CLI installed and on PATH?`
          : "";
        emit("error", `Failed to start ${adapter.label}: ${error.message}.${hint}`);
        close();
      });
    },
    cancel() {
      record("aborted");
      finished = true;
      child?.kill("SIGTERM");
    },
  });
}

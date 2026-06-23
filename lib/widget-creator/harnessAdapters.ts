// One adapter per supported CLI backend.
// command  — the binary name (must be on PATH)
// args     — function that returns the CLI args given a prompt string
//            Note: prompt is passed via stdin for all adapters (avoids shell
//            ARG_MAX limits on long prompts). The args array excludes the prompt.
// parseChunk — normalise a raw stdout chunk to a plain text fragment.
//              Return null to discard the line (e.g. JSON control frames).

export type HarnessId = "claude" | "codex" | "opencode";

export type HarnessAdapter = {
  id: HarnessId;
  label: string;
  command: string;
  /** args passed before the prompt; prompt goes to stdin unless promptViaArg */
  args: string[];
  /** turn a raw stdout line into display text, or null to drop it */
  parseChunk: (raw: string) => string | null;
  /** true if this CLI takes the prompt as a trailing CLI arg instead of stdin
      (opencode's `run` subcommand has no stdin-reading mode) */
  promptViaArg?: boolean;
};

// input field to surface per tool, so status hints show what the tool is
// actually touching (file path / shell command / search pattern) instead of
// just its name
const TOOL_DETAIL_FIELD: Record<string, string> = {
  Bash: "command",
  Read: "file_path",
  Write: "file_path",
  Edit: "file_path",
  Glob: "pattern",
  Grep: "pattern",
  WebFetch: "url",
  WebSearch: "query",
};

function formatToolUse(name: string, input: Record<string, unknown> | undefined): string {
  const field = TOOL_DETAIL_FIELD[name];
  const detail = field && typeof input?.[field] === "string" ? ` ${input[field]}` : "";
  return `[tool: ${name}]${detail}\n`;
}

function parseClaudeLine(raw: string): string | null {
  // claude --output-format stream-json (without --include-partial-messages)
  // emits one complete frame per turn: {"type":"system"|"assistant"|"user"|"result",...}.
  // Assistant text/tool calls live nested under message.content[] — there is
  // no top-level "content_block_delta" or "tool_use" frame type.
  try {
    const frame = JSON.parse(raw);
    if (frame.type !== "assistant" || !Array.isArray(frame.message?.content)) return null;
    const parts: string[] = [];
    for (const block of frame.message.content) {
      if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
      else if (block?.type === "tool_use" && typeof block.name === "string") {
        parts.push(formatToolUse(block.name, block.input));
      }
    }
    return parts.length ? parts.join("") : null;
  } catch {
    // non-JSON line (e.g. startup messages) — pass through
    return raw || null;
  }
}

function parseCodexLine(raw: string): string | null {
  // codex exec --json emits one JSON object per line:
  // {"type":"item.started"|"item.completed",...,"item":{"type":"agent_message"|"command_execution"|"file_change"|...}}
  try {
    const frame = JSON.parse(raw);
    const item = frame?.item as Record<string, unknown> | undefined;
    if (!item || typeof item.type !== "string") return null;

    if (item.type === "agent_message" && frame.type === "item.completed" && typeof item.text === "string") {
      return item.text;
    }
    if (item.type === "command_execution" && frame.type === "item.started" && typeof item.command === "string") {
      return `[tool: Bash] ${item.command}\n`;
    }
    if (item.type === "file_change" && frame.type === "item.started" && Array.isArray(item.changes)) {
      const path = (item.changes[0] as Record<string, unknown> | undefined)?.path;
      return `[tool: Edit]${typeof path === "string" ? ` ${path}` : ""}\n`;
    }
    if (item.type === "mcp_tool_call" && frame.type === "item.started") {
      return `[tool: ${typeof item.tool === "string" ? item.tool : "mcp"}]\n`;
    }
    if (item.type === "web_search" && frame.type === "item.started" && typeof item.query === "string") {
      return `[tool: WebSearch] ${item.query}\n`;
    }
    return null;
  } catch {
    return raw || null;
  }
}

const OPENCODE_TOOL_DETAIL_FIELD: Record<string, string> = {
  bash: "command",
  read: "filePath",
  write: "filePath",
  edit: "filePath",
  glob: "pattern",
  grep: "pattern",
  webfetch: "url",
};

function parseOpencodeLine(raw: string): string | null {
  // opencode run --format json emits one JSON object per line:
  // {"type":"text"|"tool_use"|"step_start"|"step_finish",...,"part":{...}}
  try {
    const frame = JSON.parse(raw);
    const part = frame?.part as Record<string, unknown> | undefined;
    if (!part) return null;

    if (part.type === "text" && typeof part.text === "string") return part.text;

    if (part.type === "tool" && typeof part.tool === "string") {
      const state = part.state as Record<string, unknown> | undefined;
      if (!state || (state.status !== "completed" && state.status !== "error")) return null;
      const input = state.input as Record<string, unknown> | undefined;
      const field = OPENCODE_TOOL_DETAIL_FIELD[part.tool];
      const detail = field && typeof input?.[field] === "string" ? ` ${input[field]}` : "";
      return `[tool: ${part.tool}]${detail}\n`;
    }
    return null;
  } catch {
    // non-JSON line (e.g. startup banner) — pass through
    return raw || null;
  }
}

export const HARNESS_ADAPTERS: Record<HarnessId, HarnessAdapter> = {
  claude: {
    id: "claude",
    label: "claude",
    command: "claude",
    args: [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--permission-mode", "bypassPermissions",
    ],
    parseChunk: parseClaudeLine,
  },
  codex: {
    id: "codex",
    label: "codex",
    command: "codex",
    args: ["exec", "--full-auto", "--json"],
    parseChunk: parseCodexLine,
  },
  opencode: {
    id: "opencode",
    label: "opencode",
    command: "opencode",
    // `opencode run` has no stdin-reading mode — the message is a trailing
    // positional arg (promptViaArg below), unlike claude/codex which read
    // their prompt from stdin
    args: ["run", "--format", "json"],
    parseChunk: parseOpencodeLine,
    promptViaArg: true,
  },
};

export const HARNESS_CHAIN_DEFAULT: HarnessId[] = ["claude", "codex", "opencode"];

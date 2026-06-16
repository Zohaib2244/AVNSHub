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
  /** args passed before the prompt; prompt goes to stdin */
  args: string[];
  /** turn a raw stdout line into display text, or null to drop it */
  parseChunk: (raw: string) => string | null;
};

function parseClaudeLine(raw: string): string | null {
  // claude --output-format stream-json emits newline-delimited JSON frames
  try {
    const frame = JSON.parse(raw);
    // assistant text delta
    if (frame.type === "content_block_delta" && frame.delta?.type === "text_delta") {
      return frame.delta.text ?? null;
    }
    // tool use / result — surface as a status hint
    if (frame.type === "tool_use") return `[tool: ${frame.name}]\n`;
    // ignore all other frame types
    return null;
  } catch {
    // non-JSON line (e.g. startup messages) — pass through
    return raw || null;
  }
}

function parseCodexLine(raw: string): string | null {
  try {
    const frame = JSON.parse(raw);
    if (typeof frame.text === "string") return frame.text;
    if (typeof frame.content === "string") return frame.content;
    return null;
  } catch {
    return raw || null;
  }
}

function parseOpencodeLine(raw: string): string | null {
  // opencode streams plain text
  return raw || null;
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
    args: [],
    parseChunk: parseOpencodeLine,
  },
};

export const HARNESS_CHAIN_DEFAULT: HarnessId[] = ["claude", "codex", "opencode"];

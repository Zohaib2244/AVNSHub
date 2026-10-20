import type { HarnessId } from "./harnessAdapters";

export type Usage = { input: number | null; cached: number | null; cacheWrite: number | null; output: number | null };
export type UsageRun = Usage & {
  id: string; startedAt: string; durationMs: number; harness: HarnessId;
  model: string; stage: "chat" | "plan" | "ideate" | "build" | "fix";
  status: "done" | "error" | "limit" | "aborted";
};
export const EMPTY_USAGE: Usage = { input: null, cached: null, cacheWrite: null, output: null };
const count = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

/** Read terminal usage only: assistant frames may repeat cumulative counters. */
export function parseUsage(harness: HarnessId, line: string): { usage: Usage; model?: string } | null {
  try {
    const f = JSON.parse(line);
    if (harness === "claude" && f.type === "result" && f.usage) {
      const u = f.usage;
      const uncached = count(u.input_tokens), cached = count(u.cache_read_input_tokens), cacheWrite = count(u.cache_creation_input_tokens);
      return { usage: { input: uncached === null ? null : uncached + (cached ?? 0) + (cacheWrite ?? 0), cached, cacheWrite, output: count(u.output_tokens) }, model: Object.keys(f.modelUsage ?? {}).join(", ") || undefined };
    }
    if (harness === "codex" && f.type === "turn.completed" && f.usage) {
      return { usage: { input: count(f.usage.input_tokens), cached: count(f.usage.cached_input_tokens), cacheWrite: null, output: count(f.usage.output_tokens) } };
    }
  } catch {}
  return null;
}

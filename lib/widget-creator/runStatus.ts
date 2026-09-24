// Server-side record of the Widget Creator's build runs, per widget slug — the
// source of truth the chat UI syncs from when it didn't see a run's stream
// (the page was reloaded, which cancels the run, or the run was started from
// another tab or device). The SSE stream stays the primary, live channel;
// this only answers "what is / what was the last run for this widget?".
//
// Lives on globalThis for the same reason as generationLock.ts: `next dev`
// can re-instantiate server modules mid-run, which would drop a module-level map.

export type RunStage = "preparing" | "writing" | "checking" | "applying";

/** "question": the harness paused to ask the user something; nothing was applied */
export type RunOutcome = "done" | "error" | "aborted" | "question";

export type RunRecord = {
  runId: string;
  slug: string;
  stage: RunStage;
  harness?: string;
  startedAt: number;
  stageStartedAt: number;
  finishedAt?: number;
  outcome?: RunOutcome;
  /** the stage a failed or aborted run stopped in */
  failedStage?: RunStage;
  message?: string;
  /** for a successful run: whether the widget was already registered */
  registered?: boolean;
};

const store = globalThis as typeof globalThis & { __wcRunStatus?: Map<string, RunRecord> };
const runs = (store.__wcRunStatus ??= new Map<string, RunRecord>());

export function startRun(runId: string, slug: string): void {
  const now = Date.now();
  runs.set(slug, { runId, slug, stage: "preparing", startedAt: now, stageStartedAt: now });
}

export function setRunStage(runId: string, slug: string, stage: RunStage, harness?: string): void {
  const run = runs.get(slug);
  if (!run || run.runId !== runId || run.finishedAt) return;
  if (run.stage !== stage) {
    run.stage = stage;
    run.stageStartedAt = Date.now();
  }
  if (harness) run.harness = harness;
}

export function finishRun(
  runId: string,
  slug: string,
  outcome: RunOutcome,
  extra: { message?: string; registered?: boolean } = {},
): void {
  const run = runs.get(slug);
  if (!run || run.runId !== runId || run.finishedAt) return;
  run.finishedAt = Date.now();
  run.outcome = outcome;
  if (outcome === "error" || outcome === "aborted") run.failedStage = run.stage;
  run.message = extra.message;
  run.registered = extra.registered;
}

export function getRun(slug: string): RunRecord | null {
  return runs.get(slug) ?? null;
}

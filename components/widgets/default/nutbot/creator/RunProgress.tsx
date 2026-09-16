"use client";

// Build-run progress for the Widget Creator chat: a step tracker that mirrors
// the server's workbench pipeline (prepare → write → check → apply, see
// docs/WIDGET_WORKBENCH.md) plus a one-line "what is it doing right now"
// activity readout. State transitions are pure functions so the SSE handler
// and the run-status poller (another tab / reload) drive the exact same view.

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

/** Date.now(), re-rendered every 500ms while `active` — drives elapsed timers */
export function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // first tick lands within 500ms; until then elapsed values clamp to 0s
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** spinner + one line of "what is happening right now" (shared by build, plan, ideate) */
export function ActivityLine({ text }: { text: string }) {
  return (
    <div className="wc-run-activity" role="status" aria-live="polite">
      <span className="wc-spinner" aria-hidden="true" />
      <span className="wc-run-activity-text">{text}</span>
    </div>
  );
}

export type StepId = "prepare" | "write" | "check" | "apply";
export type StepStatus = "pending" | "active" | "done" | "failed";

export type RunView = {
  startedAt: number;
  steps: Record<StepId, { status: StepStatus; startedAt?: number; endedAt?: number }>;
  harness?: string;
  /** latest human-readable action, e.g. "writing WbSmokeWidget.tsx" */
  activity?: string;
  finishedAt?: number;
  outcome?: "done" | "error" | "stopped";
  /** true when this tab is showing a run it didn't start (polled, not streamed) */
  remote?: boolean;
};

export const STEP_ORDER: StepId[] = ["prepare", "write", "check", "apply"];

const STEP_LABEL: Record<StepId, string> = {
  prepare: "prepare",
  write: "write",
  check: "check",
  apply: "apply",
};

/** server run stage (runStatus.ts) → step */
export const STAGE_TO_STEP: Record<string, StepId> = {
  preparing: "prepare",
  writing: "write",
  checking: "check",
  applying: "apply",
};

export function newRun(now: number, remote = false): RunView {
  return {
    startedAt: now,
    remote,
    steps: {
      prepare: { status: "active", startedAt: now },
      write: { status: "pending" },
      check: { status: "pending" },
      apply: { status: "pending" },
    },
  };
}

/** mark every step before `to` done and `to` active (or everything done) */
export function advanceRun(run: RunView, to: StepId | "done", now: number): RunView {
  const target = to === "done" ? STEP_ORDER.length : STEP_ORDER.indexOf(to);
  const steps = { ...run.steps };
  STEP_ORDER.forEach((id, i) => {
    const step = steps[id];
    if (i < target && step.status !== "done") {
      steps[id] = { status: "done", startedAt: step.startedAt ?? now, endedAt: now };
    } else if (i === target && step.status !== "active") {
      steps[id] = { status: "active", startedAt: now };
    }
  });
  return to === "done"
    ? { ...run, steps, finishedAt: now, outcome: "done", activity: undefined }
    : { ...run, steps };
}

/** fail the active step (or `at`, when the server says which stage failed) */
export function failRun(run: RunView, now: number, outcome: "error" | "stopped", at?: StepId): RunView {
  const steps = { ...run.steps };
  const failing = at ?? STEP_ORDER.find((id) => steps[id].status === "active");
  if (failing) {
    const idx = STEP_ORDER.indexOf(failing);
    STEP_ORDER.forEach((id, i) => {
      if (i < idx && steps[id].status !== "done") steps[id] = { status: "done", startedAt: steps[id].startedAt ?? now, endedAt: now };
    });
    steps[failing] = { status: "failed", startedAt: steps[failing].startedAt ?? now, endedAt: now };
  }
  return { ...run, steps, finishedAt: now, outcome, activity: undefined };
}

export function isRunActive(run: RunView | null): boolean {
  return Boolean(run && !run.finishedAt);
}

const TOOL_VERB: Record<string, string> = {
  Write: "writing",
  Edit: "editing",
  MultiEdit: "editing",
  Read: "reading",
  Glob: "looking through files",
  Grep: "searching the code",
  Bash: "running a command",
  Skill: "loading the widget build rules",
  TodoWrite: "planning the change",
  WebFetch: "fetching a page",
  WebSearch: "searching the web",
};

/** "[tool: Write] /…/components/widgets/custom/x/XWidget.tsx" → "writing XWidget.tsx" */
export function activityFromChunk(text: string): string | null {
  const tool = /\[tool: ([A-Za-z]+)\]\s*(.*)/.exec(text);
  if (!tool) return text.trim() ? "explaining the change" : null;
  const verb = TOOL_VERB[tool[1]] ?? `using ${tool[1]}`;
  const target = tool[2].trim();
  if (!target || tool[1] === "Skill" || tool[1] === "TodoWrite") return verb;
  if (tool[1] === "Bash") return `${verb}: ${target.slice(0, 48)}`;
  const base = target.split(/[\\/]/).filter(Boolean).pop() ?? target;
  return `${verb} ${base}`;
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function stepElapsed(step: RunView["steps"][StepId], now: number): string | null {
  if (!step.startedAt) return null;
  const ms = (step.endedAt ?? now) - step.startedAt;
  if (step.status === "done" && ms < 1000) return "<1s";
  return formatElapsed(ms);
}

export function RunSteps({ run, now }: { run: RunView; now: number }) {
  return (
    <ol className="wc-run-steps" aria-label="build progress">
      {STEP_ORDER.map((id, index) => {
        const step = run.steps[id];
        // a run seen from another tab only knows when its current stage began
        const elapsed = step.status === "pending" || (run.remote && step.status !== "active") ? null : stepElapsed(step, now);
        return (
          <li key={id} className="wc-run-step-item">
            {index > 0 && <span className="wc-run-sep" aria-hidden="true">›</span>}
            <span className={`wc-run-step ${step.status}`} aria-current={step.status === "active" ? "step" : undefined}>
              <span className="wc-run-step-icon" aria-hidden="true">
                {step.status === "active" && <span className="wc-spinner" />}
                {step.status === "done" && <Check size={9} strokeWidth={3} />}
                {step.status === "failed" && <X size={9} strokeWidth={3} />}
              </span>
              <span className="wc-run-step-label">{STEP_LABEL[id]}</span>
              {elapsed && <span className="wc-run-step-time">{elapsed}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const ACTIVE_HINT: Record<StepId, string> = {
  prepare: "preparing a private workbench copy",
  write: "starting the harness",
  check: "type-checking the draft",
  apply: "applying the checked draft to your dashboard",
};

export function RunActivity({ run, now }: { run: RunView; now: number }) {
  const active = STEP_ORDER.find((id) => run.steps[id].status === "active");
  if (!active) return null;
  // a run seen from another tab has no tool stream, so describe the stage itself
  const text = active === "write" && run.activity
    ? run.activity
    : run.remote && active === "write" ? "the harness is writing the widget" : ACTIVE_HINT[active];
  const slowCheck = active === "check" && now - (run.steps.check.startedAt ?? now) > 6000;
  return (
    <ActivityLine
      text={`${run.remote ? "running in another tab · " : ""}${text}${slowCheck ? " — the first check in a new workbench can take ~10s" : ""}`}
    />
  );
}

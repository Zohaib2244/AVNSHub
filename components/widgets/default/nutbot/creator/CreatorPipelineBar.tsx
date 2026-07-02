"use client";

import { Map, Lightbulb, Hammer } from "lucide-react";
import type { ProjectMode } from "@/lib/widget-creator/projectStore";

const STAGE_META: Record<ProjectMode, { label: string; Icon: React.ElementType }> = {
  plan:   { label: "plan",   Icon: Map },
  ideate: { label: "ideate", Icon: Lightbulb },
  build:  { label: "build",  Icon: Hammer },
};

const ALL_STAGES: ProjectMode[] = ["plan", "ideate", "build"];
const STAGE_INDEX: Record<ProjectMode, number> = { plan: 0, ideate: 1, build: 2 };

type Props = {
  entryMode: ProjectMode;
  activeMode: ProjectMode;
  workflowMode: ProjectMode;
  hasBrief: boolean;
  hasIdeateRounds: boolean;
  hasBuildOutput: boolean;
  onStage: (mode: ProjectMode) => void;
  /** When true, non-active stage buttons are visually dimmed and clicks are blocked. */
  locked?: boolean;
};

export function CreatorPipelineBar({
  entryMode,
  activeMode,
  workflowMode,
  hasBrief,
  hasIdeateRounds,
  hasBuildOutput,
  onStage,
  locked = false,
}: Props) {
  const fromIdx = ALL_STAGES.indexOf(entryMode);
  const stages = ALL_STAGES.slice(fromIdx);
  const workflowIdx = STAGE_INDEX[workflowMode];

  function hasData(mode: ProjectMode): boolean {
    if (mode === "plan")   return hasBrief;
    if (mode === "ideate") return hasIdeateRounds;
    if (mode === "build")  return hasBuildOutput;
    return false;
  }

  return (
    <div className="cr-pipeline">
      {stages.map((mode, i) => {
        const { Icon } = STAGE_META[mode];
        const isCurrent  = mode === activeMode;
        const dataExists = hasData(mode);
        const isReview = STAGE_INDEX[mode] < workflowIdx;
        const isFuture = STAGE_INDEX[mode] > workflowIdx;
        const label = mode === "build" && hasBuildOutput ? "edit" : STAGE_META[mode].label;
        const disabled = locked || isFuture;
        const title = locked
          ? "AI is working — wait for it to finish"
          : isFuture
            ? `continue from ${STAGE_META[workflowMode].label} to unlock ${STAGE_META[mode].label}`
            : isReview
              ? `${label} transcript is review-only`
              : label;
        return (
          <button
            key={mode}
            type="button"
            className={`cr-stage${isCurrent ? " current" : ""}${dataExists && !isCurrent ? " has-data" : ""}${isReview ? " review" : ""}${isFuture ? " future" : ""}${disabled ? " locked" : ""}`}
            onClick={() => onStage(mode)}
            disabled={disabled}
            title={title}
          >
            {dataExists && !isCurrent && <span className="cr-stage-dot" />}
            <Icon size={11} strokeWidth={1.75} />
            <span className="cr-stage-label">{label}</span>
            {i < stages.length - 1 && <span className="cr-stage-arrow">›</span>}
          </button>
        );
      })}
    </div>
  );
}

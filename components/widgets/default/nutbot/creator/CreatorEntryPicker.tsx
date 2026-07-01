"use client";

import { ArrowLeft, Hammer, Lightbulb, Map } from "lucide-react";
import type { ProjectMode } from "@/lib/widget-creator/projectStore";

type Props = {
  onPick: (mode: ProjectMode) => void;
  onBack: () => void;
};

const ENTRIES: { mode: ProjectMode; label: string; Icon: React.ElementType; desc: string }[] = [
  {
    mode: "plan",
    label: "Plan",
    Icon: Map,
    desc: "Chat with AI to figure out what to build. Get a structured brief, then jump into ideate or build.",
  },
  {
    mode: "ideate",
    label: "Ideate",
    Icon: Lightbulb,
    desc: "Brainstorm HTML/CSS mockups before writing real code. Visualize multiple directions, then finalize one.",
  },
  {
    mode: "build",
    label: "Build",
    Icon: Hammer,
    desc: "Jump straight into code generation. Describe your widget and let the AI write the component.",
  },
];

export function CreatorEntryPicker({ onPick, onBack }: Props) {
  return (
    <div className="cr-picker">
      <div className="cr-picker-header">
        <button type="button" className="cr-back-btn" onClick={onBack}>
          <ArrowLeft size={12} strokeWidth={2} />
          projects
        </button>
        <span className="cr-picker-title">new widget</span>
      </div>
      <p className="cr-picker-subtitle">where do you want to start?</p>
      <div className="cr-picker-cards">
        {ENTRIES.map(({ mode, label, Icon, desc }) => (
          <button
            key={mode}
            type="button"
            className={`cr-entry-card cr-entry-card--${mode}`}
            onClick={() => onPick(mode)}
          >
            <div className="cr-entry-icon">
              <Icon size={18} strokeWidth={1.75} />
            </div>
            <div className="cr-entry-label">{label}</div>
            <p className="cr-entry-desc">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

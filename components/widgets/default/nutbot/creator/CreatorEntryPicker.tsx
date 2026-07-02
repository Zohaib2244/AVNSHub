"use client";

import { useState } from "react";
import { ArrowLeft, Hammer, Lightbulb, Map } from "lucide-react";
import type { ProjectMode, ProjectIdentity } from "@/lib/widget-creator/projectStore";
import { slugify } from "@/lib/widget-creator/slug";
import { LUCIDE_SUGGESTIONS } from "@/lib/widget-creator/lucideSuggestions";

type Props = {
  onPick: (mode: ProjectMode, identity?: ProjectIdentity) => void;
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
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [decideLater, setDecideLater] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handlePick(mode: ProjectMode) {
    const identity: ProjectIdentity | undefined = decideLater
      ? undefined
      : { name: name.trim() || undefined, icon: icon.trim() || undefined, slug: slug.trim() || undefined };
    onPick(mode, identity);
  }

  return (
    <div className="cr-picker">
      <div className="cr-picker-header">
        <button type="button" className="cr-back-btn" onClick={onBack}>
          <ArrowLeft size={12} strokeWidth={2} />
          projects
        </button>
        <span className="cr-picker-title">new widget</span>
      </div>

      <div className="cr-identity-card">
        <div className="cr-identity-head">
          <span className="wc-field-label">name it now, or decide later</span>
          <button
            type="button"
            className={`wc-toggle-btn${decideLater ? " active" : ""}`}
            onClick={() => setDecideLater((v) => !v)}
          >
            {decideLater ? "deciding later" : "decide later"}
          </button>
        </div>

        {!decideLater && (
          <>
            <div className="wc-row-pair">
              <div className="wc-field">
                <span className="wc-field-label">name</span>
                <input
                  className="wc-input"
                  placeholder="weather"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
              </div>
              <div className="wc-field">
                <span className="wc-field-label">icon</span>
                <input
                  className="wc-input"
                  placeholder="Cloud"
                  list="wc-icon-list"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                />
                <datalist id="wc-icon-list">
                  {LUCIDE_SUGGESTIONS.map((i) => <option key={i} value={i} />)}
                </datalist>
              </div>
            </div>
            <div className="wc-field">
              <span className="wc-field-label">slug</span>
              <input
                className="wc-input"
                placeholder="auto-derived"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
              />
            </div>
          </>
        )}

        {decideLater && (
          <p className="cr-picker-subtitle cr-identity-later-hint">
            no problem — name, icon, and slug will be empty in Build mode until you (or a Plan brief) fill them in.
          </p>
        )}
      </div>

      <p className="cr-picker-subtitle">where do you want to start?</p>
      <div className="cr-picker-cards">
        {ENTRIES.map(({ mode, label, Icon, desc }) => (
          <button
            key={mode}
            type="button"
            className={`cr-entry-card cr-entry-card--${mode}`}
            onClick={() => handlePick(mode)}
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

"use client";

import { useState } from "react";
import { Hammer, Wand2 } from "lucide-react";
import type { WidgetBrief } from "@/lib/widget-creator/projectStore";
import { ModeInfoButton } from "./ModeInfoButton";

const PLAN_INFO_TEXT = "Chat with AI to figure out what to build. Describe a use case or vague idea — get concept suggestions, then a structured plan appears here once one is ready. Review and finalize it here — build it directly, or continue to Ideate for a visual mockup first.";

const SIZE_OPTIONS = ["S", "M", "L"] as const;

/** One requirement per line. Uses the model's own newlines when present;
    otherwise splits a run-on "1. ... 2. ... 3. ..." string at each number. */
function formatRequirementLines(requirements: string): string[] {
  const byNewline = requirements.split("\n").map((l) => l.trim()).filter(Boolean);
  if (byNewline.length > 1) return byNewline;
  return requirements
    .split(/(?=(?:^|\s)\d{1,2}[.)]\s)/)
    .map((l) => l.trim())
    .filter(Boolean);
}

type Draft = {
  title: string;
  slug: string;
  icon: string;
  sizes: string[];
  concept: string;
  requirements: string;
  sContent: string;
  mContent: string;
  lContent: string;
  dataShape: string;
  notes: string;
};

function draftFromBrief(brief: WidgetBrief): Draft {
  return {
    title: brief.title,
    slug: brief.slug ?? "",
    icon: brief.icon ?? "",
    sizes: brief.sizes ?? [],
    concept: brief.concept,
    requirements: brief.requirements ?? "",
    sContent: brief.sContent ?? "",
    mContent: brief.mContent ?? "",
    lContent: brief.lContent ?? "",
    dataShape: brief.dataShape ?? "",
    notes: brief.notes ?? "",
  };
}

type Props = {
  brief?: WidgetBrief;
  hasBrief: boolean;
  /** an AI generation is actively running for this project right now */
  locked: boolean;
  /** the Plan stage has been superseded (workflow moved to Ideate/Build) */
  readOnly: boolean;
  onBuild: (brief: WidgetBrief) => void;
  onVisualize: (brief: WidgetBrief) => void;
  onSave: (brief: WidgetBrief) => void;
};

/**
 * The single, persistent home for the current plan — lives in the Plan
 * stage's left sidebar so it survives independently of the chat transcript.
 * The chat (PlanCanvas) is free-form Q&A/iteration; only a fresh
 * ```widget-brief``` block from the model updates what's shown here. Buttons
 * disable only while a generation is actually in flight (`locked`), not
 * whenever any new chat message is sent — an off-topic question no longer
 * strands them.
 */
export function PlanBriefPanel({ brief, hasBrief, locked, readOnly, onBuild, onVisualize, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(() => (brief ? draftFromBrief(brief) : null));
  const [prevBrief, setPrevBrief] = useState(brief);

  // adjusted directly during render (React-blessed pattern) — keep the draft
  // in sync whenever a fresh brief arrives, unless the user is mid-edit
  if (brief !== prevBrief) {
    setPrevBrief(brief);
    if (!editing) setDraft(brief ? draftFromBrief(brief) : null);
  }

  if (!hasBrief || !brief) {
    return (
      <div className="wc-settings">
        <div className="wc-section">
          <div className="wc-section-body" style={{ padding: "8px 4px" }}>
            <div className="wc-mode-info-head">
              <span className="wc-field-label">plan</span>
              <ModeInfoButton text={PLAN_INFO_TEXT} />
            </div>
            <p className="wc-stage-lock-note">no plan yet — describe an idea in the chat</p>
          </div>
        </div>
      </div>
    );
  }

  function toggleSize(s: string) {
    if (!draft) return;
    const next = draft.sizes.includes(s) ? draft.sizes.filter((x) => x !== s) : [...draft.sizes, s];
    setDraft({ ...draft, sizes: next.length ? next : draft.sizes });
  }

  function save() {
    if (!draft || !brief) return;
    const next: WidgetBrief = {
      ...brief,
      title: draft.title.trim() || brief.title,
      slug: draft.slug.trim() || brief.slug,
      icon: draft.icon.trim() || undefined,
      sizes: draft.sizes.length ? draft.sizes : brief.sizes,
      concept: draft.concept.trim() || brief.concept,
      requirements: draft.requirements.trim() || undefined,
      sContent: draft.sContent.trim() || undefined,
      mContent: draft.mContent.trim() || undefined,
      lContent: draft.lContent.trim() || undefined,
      dataShape: draft.dataShape.trim() || undefined,
      notes: draft.notes.trim() || undefined,
    };
    onSave(next);
    setDraft(draftFromBrief(next));
    setEditing(false);
  }

  if (editing && draft) {
    return (
      <div className="wc-brief-card wc-brief-card-editing">
        <div className="wc-brief-edit-grid">
          <input className="wc-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="title" />
          <input className="wc-input" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="slug" />
          <input className="wc-input" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="icon" />
        </div>
        <div className="wc-toggle-group wc-brief-size-toggle">
          {SIZE_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`wc-toggle-btn${draft.sizes.includes(s) ? " active" : ""}`}
              onClick={() => toggleSize(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <textarea className="wc-textarea" value={draft.concept} onChange={(e) => setDraft({ ...draft, concept: e.target.value })} rows={2} placeholder="concept" />
        <textarea className="wc-textarea" value={draft.requirements} onChange={(e) => setDraft({ ...draft, requirements: e.target.value })} rows={6} placeholder="requirements — the complete spec: every field, control, behavior, state" />
        <textarea className="wc-textarea" value={draft.sContent} onChange={(e) => setDraft({ ...draft, sContent: e.target.value })} rows={2} placeholder="S content" />
        <textarea className="wc-textarea" value={draft.mContent} onChange={(e) => setDraft({ ...draft, mContent: e.target.value })} rows={2} placeholder="M content" />
        <textarea className="wc-textarea" value={draft.lContent} onChange={(e) => setDraft({ ...draft, lContent: e.target.value })} rows={2} placeholder="L content" />
        <textarea className="wc-textarea" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} placeholder="additional notes — constraints, inspiration, anything else to carry forward" />
        <div className="wc-brief-actions">
          <button type="button" className="wc-brief-action-btn wc-brief-build-btn" onClick={save}>save</button>
          <button
            type="button"
            className="wc-brief-action-btn"
            onClick={() => {
              setDraft(draftFromBrief(brief));
              setEditing(false);
            }}
          >
            cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wc-brief-panel">
      <div className="wc-brief-card">
        <div className="wc-brief-header">
          <span className="wc-brief-title">{brief.title}</span>
          <div className="wc-brief-meta">
            {(brief.sizes ?? []).map((s) => (
              <span key={s} className="wc-brief-tag">{s}</span>
            ))}
            {brief.slug && <span className="wc-brief-tag">#{brief.slug}</span>}
          </div>
        </div>
        {brief.concept && (
          <p className="wc-brief-concept">{brief.concept}</p>
        )}
        {brief.requirements && (
          <div className="wc-brief-requirements">
            <span className="wc-field-label">requirements</span>
            <div className="wc-brief-requirements-body">
              {formatRequirementLines(brief.requirements).map((line, i) => (
                <p key={i} className="wc-brief-req-line">{line}</p>
              ))}
            </div>
          </div>
        )}
        {brief.notes && (
          <p className="wc-brief-concept">
            <span className="wc-field-label">notes</span> {brief.notes}
          </p>
        )}
        {readOnly && (
          <p className="wc-stage-lock-note">Plan is locked for edits. This brief is kept here for review.</p>
        )}
      </div>

      {!readOnly && (
        <div className="wc-brief-actions">
          <button
            type="button"
            className="wc-brief-action-btn wc-brief-build-btn"
            onClick={() => onBuild(brief)}
            disabled={locked}
            title={locked ? "AI is working — wait for it to finish" : "locks Plan for edits and switches directly to Build"}
          >
            <Hammer size={10} strokeWidth={2} />
            direct build
          </button>
          <button
            type="button"
            className="wc-brief-action-btn wc-brief-viz-btn"
            onClick={() => onVisualize(brief)}
            disabled={locked}
            title={locked ? "AI is working — wait for it to finish" : "locks Plan for edits and continues to Ideate"}
          >
            <Wand2 size={10} strokeWidth={2} />
            continue to ideate
          </button>
          <button
            type="button"
            className="wc-brief-action-btn"
            onClick={() => setEditing(true)}
            disabled={locked}
          >
            edit
          </button>
        </div>
      )}
    </div>
  );
}

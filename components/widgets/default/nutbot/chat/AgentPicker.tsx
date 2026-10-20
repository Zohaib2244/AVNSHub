"use client";

// Inline "Agents" menu for NutBot Chat: pick the chat backend (provider) and,
// for claude/codex, the model + reasoning strength — all applied immediately,
// no separate save step. Deliberately scoped to chat only: the Widget
// Creator keeps its own provider/model controls in the Models menu
// (ModelSettings.tsx) and its own defaults (prefs.modelDefaults), untouched
// by anything here.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { getPrefs, getServerPrefs, setPrefs, subscribePrefs, type ChatBackend } from "@/lib/prefs";
import { MODEL_OPTIONS, sanitizeModelDefaults, type ModelChoice } from "@/lib/widget-creator/models";
import { backendLabel, type ConcreteBackend } from "./NutBotChat";

type ModelHarness = "claude" | "codex";

const PROVIDERS: { id: ChatBackend; label: string }[] = [
  { id: "auto", label: "auto" },
  { id: "bonfire", label: "bonfire" },
  { id: "claude", label: "claude" },
  { id: "codex", label: "codex" },
  { id: "opencode", label: "opencode" },
  { id: "off", label: "off" },
];

function isModelHarness(id: unknown): id is ModelHarness {
  return id === "claude" || id === "codex";
}

export function AgentPicker({
  mode,
  resolvedBackend,
  disabled,
}: {
  mode: "chill" | "work";
  resolvedBackend: ConcreteBackend | null;
  disabled?: boolean;
}) {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // bonfire has no tools, so it can never actually serve work mode — dropping
  // it from the list here beats offering a choice resolveBackend silently
  // reinterprets as "auto" anyway
  const providers = mode === "work" ? PROVIDERS.filter((p) => p.id !== "bonfire") : PROVIDERS;

  // the strength/model section follows whatever's actually live right now
  // (resolvedBackend), not just the pinned pref — "auto" can resolve to a
  // harness via fallback and the control should track that, not go blank
  const activeHarness = isModelHarness(resolvedBackend) ? resolvedBackend : null;
  const choice = activeHarness ? prefs.chatModelDefaults[activeHarness] : null;
  const options = activeHarness ? MODEL_OPTIONS[activeHarness] : [];
  const selected = choice ? options.find((o) => o.id === choice.model) : undefined;
  const showingCustom = customMode || Boolean(choice && choice.model !== "" && !selected);
  const supportsEffort = activeHarness === "codex"
    ? Boolean(selected)
    : activeHarness === "claude" && ["sonnet", "opus"].includes(choice?.model ?? "");

  // The popover is portaled to <body> (its trigger sits inside the chat
  // panel's overflow:auto scroller, which would otherwise clip a
  // position:absolute dropdown opening near the bottom of the panel), so
  // "outside click" has to check both the portaled node and the trigger.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current && !popoverRef.current.contains(target)) setOpen(false);
    }
    function reposition() { setOpen(false); }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    }
    document.addEventListener("keydown", escape, true);
    document.addEventListener("mousedown", handler);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);

  function toggleOpen() {
    if (open) { setOpen(false); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - 292));
      // the toolbar this button lives in usually sits near the bottom of its
      // panel — flip upward (anchor by `bottom` instead of `top`) when there
      // isn't room below for the model/strength section, same idea as any
      // flip-on-overflow popover, just without pulling in a library for it
      const spaceBelow = window.innerHeight - rect.bottom;
      setPos(
        spaceBelow < 340 && rect.top > spaceBelow
          ? { left, bottom: window.innerHeight - rect.top + 5 }
          : { left, top: rect.bottom + 5 },
      );
    }
    setOpen(true);
  }

  // a stale claude custom-id draft shouldn't linger under codex (or vice
  // versa) after the resolved provider changes — reset during render (React's
  // documented pattern for this) rather than in an effect, so it can't lag a
  // frame behind and show the wrong harness's draft
  const [prevHarness, setPrevHarness] = useState(activeHarness);
  if (activeHarness !== prevHarness) {
    setPrevHarness(activeHarness);
    setCustomMode(false);
    setCustomDraft(choice?.model ?? "");
  }

  function selectProvider(id: ChatBackend) {
    setPrefs({ chatBackend: id });
  }

  function updateModel(harness: ModelHarness, patch: Partial<ModelChoice>) {
    const draft = { ...prefs.chatModelDefaults, [harness]: { ...prefs.chatModelDefaults[harness], ...patch } };
    setPrefs({ chatModelDefaults: sanitizeModelDefaults(draft) });
  }

  function commitCustomModel() {
    if (!activeHarness) return;
    updateModel(activeHarness, { model: customDraft, effort: "default" });
  }

  const modelLabel = choice?.model ? (selected?.label ?? choice.model) : null;
  const pillLabel = `${resolvedBackend ? backendLabel(resolvedBackend) : backendLabel(prefs.chatBackend)}${modelLabel ? ` · ${modelLabel}` : ""}`;

  return (
    <div className="hp-root nb-backend-picker">
      <button
        type="button"
        ref={triggerRef}
        className={`hp-pill${open ? " open" : ""}`}
        onClick={toggleOpen}
        disabled={disabled}
        aria-label="select chat agent"
        aria-expanded={open}
      >
        <span className="hp-dot" />
        {pillLabel}
        <ChevronDown size={9} strokeWidth={2} className={open ? "hp-chevron open" : "hp-chevron"} />
      </button>

      {open && pos && createPortal(
        <div
          className="hp-popover ap-popover"
          ref={popoverRef}
          style={{
            position: "fixed",
            left: pos.left,
            top: pos.top,
            bottom: pos.bottom,
            maxHeight: "calc(100vh - 16px)",
            overflowY: "auto",
          }}
        >
          <div className="hp-popover-head">chat provider</div>
          {providers.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`hp-item hp-item-button${prefs.chatBackend === p.id ? " active" : ""}`}
              aria-pressed={prefs.chatBackend === p.id}
              onClick={() => selectProvider(p.id)}
            >
              <span className="hp-dot" />
              <span className="hp-item-label">{p.label}</span>
              {prefs.chatBackend === p.id && <span className="hp-badge active">active</span>}
            </button>
          ))}

          {activeHarness && choice && (
            <>
              <div className="hp-popover-head ap-section-head">{activeHarness} model</div>
              <div className="ap-field">
                <select
                  aria-label="model"
                  value={showingCustom ? "custom" : choice.model}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "custom") { setCustomMode(true); return; }
                    setCustomMode(false);
                    updateModel(activeHarness, { model: v, effort: "default" });
                  }}
                >
                  <option value="">CLI default</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label} — {o.strength}</option>)}
                  <option value="custom">custom model id</option>
                </select>
              </div>
              {showingCustom && (
                <div className="ap-field">
                  <input
                    value={customDraft}
                    maxLength={120}
                    placeholder="exact model id"
                    pattern="[a-zA-Z0-9][a-zA-Z0-9._/:\[\]\-]*"
                    onChange={(e) => setCustomDraft(e.target.value)}
                    onBlur={commitCustomModel}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitCustomModel(); } }}
                  />
                </div>
              )}
              <div className="ap-field">
                <label className="ap-label" htmlFor="ap-strength">strength</label>
                <select
                  id="ap-strength"
                  aria-label="strength"
                  disabled={!supportsEffort}
                  value={choice.effort}
                  onChange={(e) => updateModel(activeHarness, { effort: e.target.value as ModelChoice["effort"] })}
                >
                  <option value="default">model default</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

"use client";

import { type CSSProperties, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Copy, Pencil, Trash2 } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";

type Idea = {
  id: string;
  title: string;
  createdAt: string;
  completedAt?: string;
};

const storageKey = "nutmag-idea-inbox";
const iconProps = { size: 14, strokeWidth: 1.75 };

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const buttonStyle: CSSProperties = {
  alignItems: "center",
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  cursor: "pointer",
  display: "flex",
  flex: "0 0 auto",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  gap: 4,
  padding: "4px 7px",
};
const iconButtonStyle: CSSProperties = { ...buttonStyle, padding: "4px 6px" };
const textareaStyle: CSSProperties = {
  ...monoStyle,
  background: "var(--bg-card)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxSizing: "border-box",
  color: "var(--text-primary)",
  display: "block",
  flex: 1,
  fontSize: "0.7rem",
  lineHeight: 1.35,
  minWidth: 0,
  overflowWrap: "anywhere",
  padding: "5px 7px",
  resize: "none",
  whiteSpace: "pre-wrap",
  width: "100%",
};

function createIdeaId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(date));
}

function formatIdeaList(list: Idea[]) {
  return list.map((idea, index) => `${index + 1}. ${idea.title}`).join("\n");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Textarea that wraps long text and grows with its content up to `maxHeight`,
    then scrolls. Enter submits, Shift+Enter inserts a newline, Escape cancels. */
function AutoTextarea({ autoFocus, label, maxHeight, onCancel, onChange, onSubmit, placeholder, value }: {
  autoFocus?: boolean;
  label: string;
  maxHeight: number;
  onCancel?: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  value: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight + 3, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight + 3 > maxHeight ? "auto" : "hidden";
  }, [value, maxHeight]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    } else if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
    }
  };

  return <textarea aria-label={label} autoFocus={autoFocus} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} ref={ref} rows={1} style={textareaStyle} value={value} />;
}

/* Feedback for the two actions you press most: the copy button swaps to a
   check and pulses, the done tick pops as it flips. Both are keyed on the
   idea id so pressing the same button twice replays the animation. */
const FEEDBACK_STYLES = `
  .ii-pop { animation: iiPop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .ii-flash { animation: iiFlash 1.2s ease-out; }
  /* a completed idea leaves the list, so it lingers just long enough to show
     the tick flip and fade out rather than blinking away */
  .ii-leave { animation: iiLeave 0.34s ease forwards; }

  @keyframes iiPop {
    0%   { transform: scale(1); }
    45%  { transform: scale(1.28); }
    100% { transform: scale(1); }
  }

  @keyframes iiFlash {
    0%, 70% { border-color: var(--accent-cyan); color: var(--accent-cyan); }
    100%    { border-color: var(--border); }
  }

  @keyframes iiLeave {
    0%   { opacity: 1; transform: none; }
    100% { opacity: 0; transform: translateX(10px) scale(0.98); }
  }

  @media (prefers-reduced-motion: reduce) {
    .ii-pop { animation: none; }
    .ii-flash { animation-duration: 0.01s; }
    .ii-leave { animation-duration: 0.01s; }
  }
`;

const paneRowStyle = (selected: boolean): CSSProperties => ({
  alignItems: "center",
  background: selected ? "color-mix(in srgb, var(--accent-cyan) 10%, transparent)" : "transparent",
  border: "1.5px solid",
  borderColor: selected ? "var(--accent-cyan)" : "transparent",
  borderRadius: 7,
  display: "flex",
  flex: "0 0 auto",
  gap: 6,
  minWidth: 0,
  padding: "4px 5px",
});

export function IdeaInboxWidget() {
  const { size } = useWidget();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  // M/L are a two-pane layout like the Notes widget: this is the idea open in
  // the right-hand pane
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // id whose done-tick should replay its pop animation
  const [pulseId, setPulseId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists on the client; loading it after mount (not in a lazy initializer) keeps the server render and first client render identical
        setIdeas(saved.filter((item): item is Idea =>
          typeof item === "object" && item !== null &&
          typeof (item as Idea).id === "string" && typeof (item as Idea).title === "string" &&
          typeof (item as Idea).createdAt === "string"
        ));
      }
    } catch {
      // A malformed local value should not prevent the inbox from opening.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(storageKey, JSON.stringify(ideas));
  }, [ideas, loaded]);

  const { active, completed } = useMemo(() => {
    const activeIdeas = ideas.filter((idea) => !idea.completedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const completedIdeas = ideas.filter((idea) => idea.completedAt).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    return { active: activeIdeas, completed: completedIdeas };
  }, [ideas]);

  const addIdea = () => {
    const title = draft.trim();
    if (!title) return;
    setIdeas((current) => [{ id: createIdeaId(), title, createdAt: new Date().toISOString() }, ...current]);
    setDraft("");
  };
  const toggleDone = (id: string, done: boolean) => {
    setIdeas((current) => current.map((idea) =>
      idea.id === id ? { ...idea, completedAt: done ? new Date().toISOString() : undefined } : idea
    ));
    setPulseId(id);
    window.setTimeout(() => setPulseId((current) => (current === id ? null : current)), 340);
  };
  const saveEdit = () => {
    const title = editingTitle.trim();
    if (!editingId || !title) return;
    setIdeas((current) => current.map((idea) => idea.id === editingId ? { ...idea, title } : idea));
    setEditingId(null);
  };
  const deleteIdea = (id: string) => {
    if (window.confirm("Delete this idea? This cannot be undone.")) setIdeas((current) => current.filter((idea) => idea.id !== id));
  };
  const copyIdea = async (idea: Idea) => {
    if (!(await copyText(idea.title))) return;
    setCopiedId(idea.id);
    window.setTimeout(() => setCopiedId((current) => (current === idea.id ? null : current)), 1200);
  };
  const copyAll = async (list: Idea[]) => {
    if (!list.length || !(await copyText(formatIdeaList(list)))) return;
    setCopiedAll(true);
    window.setTimeout(() => setCopiedAll(false), 1200);
  };
  const completeAll = () => {
    const now = new Date().toISOString();
    setIdeas((current) => current.map((idea) => (idea.completedAt ? idea : { ...idea, completedAt: now })));
  };

  const addForm = (maxHeight: number) => (
    <form onSubmit={(event) => { event.preventDefault(); addIdea(); }} style={{ alignItems: "flex-end", display: "flex", flex: "0 0 auto", gap: 6, minWidth: 0 }}>
      <AutoTextarea label="Add an idea" maxHeight={maxHeight} onChange={setDraft} onSubmit={addIdea} placeholder="Add an idea..." value={draft} />
      <button style={buttonStyle} type="submit">Add</button>
    </form>
  );
  const toolbar = (list: Idea[], { allowComplete }: { allowComplete: boolean }) => (
    <div style={{ display: "flex", flex: "0 0 auto", gap: 6 }}>
      <button
        aria-label="Copy all as a numbered list"
        disabled={!list.length}
        onClick={() => copyAll(list)}
        style={{ ...buttonStyle, opacity: list.length ? 1 : 0.5 }}
        type="button"
      >
        {copiedAll ? <Check {...iconProps} /> : <Copy {...iconProps} />} All
      </button>
      {allowComplete && <button
        aria-label="Mark all active ideas complete"
        disabled={!list.length}
        onClick={completeAll}
        style={{ ...buttonStyle, opacity: list.length ? 1 : 0.5 }}
        type="button"
      >
        <CheckCheck {...iconProps} /> All
      </button>}
    </div>
  );
  /** done tick — pops as it flips, orange while done */
  const doneButton = (idea: Idea, extra: CSSProperties = {}) => {
    const isDone = Boolean(idea.completedAt);
    return (
      <button
        aria-label={isDone ? `Restore ${idea.title}` : `Mark ${idea.title} done`}
        aria-pressed={isDone}
        className={pulseId === idea.id ? "ii-pop" : undefined}
        key={`${idea.id}-${isDone}-${pulseId === idea.id}`}
        onClick={() => toggleDone(idea.id, !isDone)}
        style={{
          ...iconButtonStyle,
          background: isDone ? "var(--accent-orange)" : "var(--bg-nested)",
          borderColor: isDone ? "var(--accent-orange)" : "var(--border)",
          color: isDone ? "var(--bg-card)" : "var(--text-primary)",
          ...extra,
        }}
        type="button"
      >
        <Check {...iconProps} />
      </button>
    );
  };

  /** copy — swaps to a check and flashes cyan for the copied window */
  const copyButton = (idea: Idea, withLabel = false) => {
    const copied = copiedId === idea.id;
    return (
      <button
        aria-label={copied ? "Copied" : `Copy ${idea.title}`}
        className={copied ? "ii-flash" : undefined}
        key={`${idea.id}-${copied}`}
        onClick={() => copyIdea(idea)}
        style={{ ...iconButtonStyle, ...(withLabel ? { padding: "4px 7px" } : {}) }}
        title={copied ? "Copied" : "Copy"}
        type="button"
      >
        <span className={copied ? "ii-pop" : undefined} style={{ display: "inline-flex" }}>
          {copied ? <Check {...iconProps} /> : <Copy {...iconProps} />}
        </span>
        {withLabel && (copied ? "Copied" : "Copy")}
      </button>
    );
  };

  const row = (idea: Idea, { clamp = false, actions = true } = {}) => {
    const isEditing = editingId === idea.id;
    return (
      <div className="more-row" key={idea.id} style={{ alignItems: "flex-start", background: "var(--bg-nested)", border: "1.5px solid var(--border)", borderRadius: 12, display: "flex", flex: "0 0 auto", gap: 7, minWidth: 0, padding: "6px 7px" }}>
        {doneButton(idea, { marginTop: 1 })}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <form onSubmit={(event) => { event.preventDefault(); saveEdit(); }} style={{ alignItems: "flex-end", display: "flex", gap: 4, minWidth: 0 }}>
              <AutoTextarea autoFocus label="Edit idea" maxHeight={120} onCancel={() => setEditingId(null)} onChange={setEditingTitle} onSubmit={saveEdit} value={editingTitle} />
              <button style={buttonStyle} type="submit">Save</button>
            </form>
          ) : <div className="block-sub" style={{
            color: "var(--text-primary)", lineHeight: 1.25, overflowWrap: "anywhere", whiteSpace: "pre-wrap",
            textDecoration: idea.completedAt ? "line-through" : "none",
            ...(clamp ? { display: "-webkit-box", overflow: "hidden", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 } : {}),
          }}>{idea.title}</div>}
          <div className="more-meta" style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.58rem", marginTop: 3 }}>{idea.completedAt ? `Done ${formatDate(idea.completedAt)}` : `Added ${formatDate(idea.createdAt)}`}</div>
        </div>
        {!isEditing && <div style={{ display: "flex", flex: "0 0 auto", gap: 4 }}>
          {copyButton(idea)}
          {actions && <button aria-label={`Edit ${idea.title}`} onClick={() => { setEditingId(idea.id); setEditingTitle(idea.title); }} style={iconButtonStyle} type="button">
            <Pencil {...iconProps} />
          </button>}
          {actions && <button aria-label={`Delete ${idea.title}`} onClick={() => deleteIdea(idea.id)} style={iconButtonStyle} type="button">
            <Trash2 {...iconProps} />
          </button>}
        </div>}
      </div>
    );
  };
  /** active / done switch in the left pane header (L only) */
  const tabStyle = (on: boolean): CSSProperties => ({
    ...buttonStyle,
    background: on ? "var(--bg-card)" : "var(--bg-nested)",
    boxShadow: on ? "none" : buttonStyle.boxShadow,
    color: on ? "var(--accent-orange)" : "var(--text-muted)",
  });

  const emptyNote = (text: string) => <div className="block-sub" style={{ color: "var(--text-muted)", padding: "4px 0" }}>{text}</div>;

  // S: next idea + quick add. No done section, no toolbar - there's no room to spare.
  if (size === "S") {
    const next = active[0];
    return <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", minHeight: 0 }}>
      <style>{FEEDBACK_STYLES}</style>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{next ? row(next, { clamp: true, actions: false }) : emptyNote("Your next thought belongs here.")}</div>
      {addForm(48)}
    </div>;
  }

  // M and L: the Notes widget's two-pane shape — the list on the left, the
  // idea you picked open on the right, where it can be read and edited in
  // full instead of inside a cramped row.
  // the idea being ticked stays listed for the length of its animation
  const base = showDone ? completed : active;
  const strayPulse = pulseId && !base.some((idea) => idea.id === pulseId)
    ? ideas.find((idea) => idea.id === pulseId) ?? null
    : null;
  const visible = strayPulse
    ? [...base, strayPulse].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : base;
  const selected = visible.find((idea) => idea.id === selectedId) ?? visible[0] ?? null;
  const isLarge = size === "L";

  return (
    <div style={{ display: "flex", gap: 0, height: "100%", minHeight: 0 }}>
      <style>{FEEDBACK_STYLES}</style>

      <aside
        style={{
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          minHeight: 0,
          minWidth: 0,
          paddingRight: 10,
          width: isLarge ? "42%" : "46%",
        }}
      >
        {isLarge && (
          <div style={{ display: "flex", flex: "0 0 auto", gap: 6 }}>
            <button aria-pressed={!showDone} onClick={() => setShowDone(false)} style={tabStyle(!showDone)} type="button">
              Active · {active.length}
            </button>
            <button aria-pressed={showDone} onClick={() => setShowDone(true)} style={tabStyle(showDone)} type="button">
              Done · {completed.length}
            </button>
          </div>
        )}

        <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 4, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
          {visible.length === 0
            ? emptyNote(showDone ? "Implemented ideas will appear here." : "Nothing waiting - add the first thought.")
            : visible.map((idea) => {
              const isSelected = selected?.id === idea.id;
              return (
                <div className={strayPulse?.id === idea.id ? "ii-leave" : undefined} key={idea.id} style={paneRowStyle(isSelected)}>
                  {doneButton(idea)}
                  <button
                    aria-pressed={isSelected}
                    onClick={() => setSelectedId(idea.id)}
                    style={{
                      background: "transparent", border: 0, color: "var(--text-primary)", cursor: "pointer",
                      flex: 1, minWidth: 0, padding: 0, textAlign: "left",
                    }}
                    type="button"
                  >
                    <span
                      style={{
                        ...monoStyle, display: "block", fontSize: "0.72rem", fontWeight: isSelected ? 700 : 500,
                        overflow: "hidden", textDecoration: idea.completedAt ? "line-through" : "none",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {idea.title}
                    </span>
                  </button>
                  <span style={{ ...monoStyle, color: "var(--text-muted)", flex: "0 0 auto", fontSize: "0.58rem" }}>
                    {formatDate(idea.completedAt ?? idea.createdAt)}
                  </span>
                </div>
              );
            })}
        </div>

        {!showDone && addForm(isLarge ? 72 : 56)}
      </aside>

      <section style={{ display: "flex", flexDirection: "column", gap: 7, minHeight: 0, minWidth: 0, paddingLeft: 12, width: isLarge ? "58%" : "54%" }}>
        <div
          style={{
            background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 8,
            flex: "1 1 auto", minHeight: 0, overflow: "hidden", padding: "9px 10px",
          }}
        >
          {selected ? (
            <textarea
              aria-label="selected idea"
              defaultValue={selected.title}
              key={selected.id}
              onBlur={(event) => {
                const text = event.currentTarget.value.trim();
                if (!text) {
                  event.currentTarget.value = selected.title;
                  return;
                }
                if (text !== selected.title) {
                  setIdeas((current) => current.map((idea) => (idea.id === selected.id ? { ...idea, title: text } : idea)));
                }
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.blur();
              }}
              spellCheck={false}
              style={{
                ...monoStyle, background: "transparent", border: 0, color: "var(--text-primary)", display: "block",
                fontSize: "0.76rem", height: "100%", lineHeight: 1.35, minHeight: 0, outline: "none", padding: 0,
                resize: "none", scrollbarColor: "var(--border) transparent", scrollbarWidth: "thin", width: "100%",
              }}
            />
          ) : (
            emptyNote(showDone ? "No finished ideas yet." : "Add an idea to get started.")
          )}
        </div>

        <div style={{ alignItems: "center", display: "flex", flex: "0 0 auto", gap: 6, minWidth: 0 }}>
          <span style={{ ...monoStyle, color: "var(--text-muted)", flex: 1, fontSize: "0.58rem", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected
              ? selected.completedAt ? `Done ${formatDate(selected.completedAt)}` : `Added ${formatDate(selected.createdAt)}`
              : ""}
          </span>
          {selected && copyButton(selected, isLarge)}
          {selected && doneButton(selected)}
          {selected && (
            <button aria-label={`Delete ${selected.title}`} onClick={() => deleteIdea(selected.id)} style={iconButtonStyle} title="Delete" type="button">
              <Trash2 {...iconProps} />
            </button>
          )}
          {isLarge && toolbar(visible, { allowComplete: !showDone })}
        </div>
      </section>
    </div>
  );
}

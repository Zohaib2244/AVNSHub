"use client";

import { type CSSProperties, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

type Idea = {
  id: string;
  title: string;
  createdAt: string;
  completedAt?: string;
};

const storageKey = "nutmag-idea-inbox";

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const buttonStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  cursor: "pointer",
  flex: "0 0 auto",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  padding: "4px 7px",
};
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

export function IdeaInboxWidget() {
  const { size } = useWidget();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
  const toggleDone = (id: string, done: boolean) => setIdeas((current) => current.map((idea) =>
    idea.id === id ? { ...idea, completedAt: done ? new Date().toISOString() : undefined } : idea
  ));
  const saveEdit = () => {
    const title = editingTitle.trim();
    if (!editingId || !title) return;
    setIdeas((current) => current.map((idea) => idea.id === editingId ? { ...idea, title } : idea));
    setEditingId(null);
  };
  const deleteIdea = (id: string) => {
    if (window.confirm("Delete this idea? This cannot be undone.")) setIdeas((current) => current.filter((idea) => idea.id !== id));
  };

  const addForm = (maxHeight: number) => (
    <form onSubmit={(event) => { event.preventDefault(); addIdea(); }} style={{ alignItems: "flex-end", display: "flex", flex: "0 0 auto", gap: 6, minWidth: 0 }}>
      <AutoTextarea label="Add an idea" maxHeight={maxHeight} onChange={setDraft} onSubmit={addIdea} placeholder="Add an idea…" value={draft} />
      <button style={buttonStyle} type="submit">Add</button>
    </form>
  );
  const row = (idea: Idea, { clamp = false, actions = true } = {}) => {
    const isEditing = editingId === idea.id;
    return (
      <div className="more-row" key={idea.id} style={{ alignItems: "flex-start", background: "var(--bg-nested)", border: "1.5px solid var(--border)", borderRadius: 12, display: "flex", flex: "0 0 auto", gap: 7, minWidth: 0, padding: "6px 7px" }}>
        <input aria-label={idea.completedAt ? `Restore ${idea.title}` : `Mark ${idea.title} done`} checked={Boolean(idea.completedAt)} onChange={(event) => toggleDone(idea.id, event.target.checked)} style={{ accentColor: "var(--accent-orange)", flex: "0 0 auto", marginTop: 3 }} type="checkbox" />
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
        {!isEditing && actions && <div style={{ display: "flex", flex: "0 0 auto", gap: 4 }}>
          <button aria-label={`Edit ${idea.title}`} onClick={() => { setEditingId(idea.id); setEditingTitle(idea.title); }} style={buttonStyle} type="button">Edit</button>
          <button aria-label={`Delete ${idea.title}`} onClick={() => deleteIdea(idea.id)} style={buttonStyle} type="button">Del</button>
        </div>}
      </div>
    );
  };
  const emptyNote = (text: string) => <div className="block-sub" style={{ color: "var(--text-muted)", padding: "4px 0" }}>{text}</div>;

  // S: next idea + quick add. No done section.
  if (size === "S") {
    const next = active[0];
    return <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{next ? row(next, { clamp: true, actions: false }) : emptyNote("Your next thought belongs here.")}</div>
      {addForm(48)}
    </div>;
  }

  // M: one add form + active list. No done section.
  if (size === "M") {
    return <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", minHeight: 0 }}>
      {addForm(64)}
      <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 6, minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
        {active.length ? active.map((idea) => row(idea)) : emptyNote("Nothing waiting—add the first thought.")}
      </div>
    </div>;
  }

  // L: a compact active/done switch swaps the list, so "done" never steals height.
  const tabStyle = (on: boolean): CSSProperties => ({
    ...buttonStyle,
    background: on ? "var(--bg-card)" : "var(--bg-nested)",
    boxShadow: on ? "none" : buttonStyle.boxShadow,
    color: on ? "var(--accent-orange)" : "var(--text-muted)",
  });
  return <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", minHeight: 0 }}>
    <div style={{ alignItems: "center", display: "flex", flex: "0 0 auto", gap: 6 }}>
      <button aria-pressed={!showDone} onClick={() => setShowDone(false)} style={tabStyle(!showDone)} type="button">Active · {active.length}</button>
      <button aria-pressed={showDone} onClick={() => setShowDone(true)} style={tabStyle(showDone)} type="button">Done · {completed.length}</button>
    </div>
    {!showDone && addForm(96)}
    <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 6, minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
      {showDone
        ? (completed.length ? completed.map((idea) => row(idea)) : emptyNote("Implemented ideas will appear here."))
        : (active.length ? active.map((idea) => row(idea)) : emptyNote("Nothing waiting—add the first thought."))}
    </div>
  </div>;
}

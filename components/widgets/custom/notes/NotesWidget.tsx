"use client";

import {
  type CSSProperties,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Pin, PinOff, Plus, Square, Trash2 } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { timeAgo } from "@/lib/format";

type Note = {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "nutmag-notes";
const EMPTY_NOTES: Note[] = [];
const listeners = new Set<() => void>();

let notes: Note[] | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes ?? EMPTY_NOTES));
  } catch {
    // Keep the in-memory snapshot when storage is unavailable.
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseNote(value: unknown): Note | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id : "";
  const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
  if (!id || !text || !isFiniteNumber(candidate.createdAt) || !isFiniteNumber(candidate.updatedAt)) {
    return null;
  }

  return {
    id,
    text,
    pinned: candidate.pinned === true,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

function readStoredNotes(): Note[] {
  if (typeof window === "undefined") return EMPTY_NOTES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_NOTES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_NOTES;
    return parsed.map(parseNote).filter((note): note is Note => note !== null);
  } catch {
    return EMPTY_NOTES;
  }
}

function getNotes(): Note[] {
  if (notes === null) notes = readStoredNotes();
  return notes;
}

function getServerNotes(): Note[] {
  return EMPTY_NOTES;
}

function subscribeNotes(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function sortNotes(noteList: Note[]): Note[] {
  return [...noteList].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
    return b.createdAt - a.createdAt;
  });
}

function createNoteId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function addNote(text: string): Note | null {
  const cleanText = text.trim();
  if (!cleanText) return null;
  const now = Date.now();
  const note: Note = {
    id: createNoteId(),
    text: cleanText,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
  notes = [note, ...getNotes()];
  persist();
  emit();
  return note;
}

function updateNote(id: string, text: string) {
  const cleanText = text.trim();
  if (!cleanText) return;
  const current = getNotes();
  let changed = false;
  notes = current.map((note) => {
    if (note.id !== id) return note;
    changed = true;
    return { ...note, text: cleanText, updatedAt: Date.now() };
  });
  if (!changed) {
    notes = current;
    return;
  }
  persist();
  emit();
}

function deleteNote(id: string) {
  const current = getNotes();
  const next = current.filter((note) => note.id !== id);
  if (next.length === current.length) return;
  notes = next;
  persist();
  emit();
}

function togglePinned(id: string) {
  const current = getNotes();
  let changed = false;
  notes = current.map((note) => {
    if (note.id !== id) return note;
    changed = true;
    return { ...note, pinned: !note.pinned, updatedAt: Date.now() };
  });
  if (!changed) {
    notes = current;
    return;
  }
  persist();
  emit();
}

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: 0,
  textTransform: "uppercase",
};

const rootStyle: CSSProperties = {
  display: "grid",
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
};

const sidebarStyle: CSSProperties = {
  borderRight: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  minWidth: 0,
  paddingRight: 10,
};

const sidebarHeaderStyle: CSSProperties = {
  alignItems: "center",
  color: "var(--text-muted)",
  display: "flex",
  flexShrink: 0,
  gap: 6,
  marginBottom: 8,
  minWidth: 0,
};

const iconButtonStyle: CSSProperties = {
  alignItems: "center",
  appearance: "none",
  background: "transparent",
  border: 0,
  borderRadius: 6,
  boxShadow: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  display: "inline-flex",
  flexShrink: 0,
  height: 22,
  justifyContent: "center",
  padding: 0,
  width: 22,
};

const primaryButtonStyle: CSSProperties = {
  ...iconButtonStyle,
  color: "var(--accent-cyan)",
};

const listStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  flexDirection: "column",
  gap: 5,
  minHeight: 0,
  overflowY: "auto",
  padding: "1px 9px 2px 0",
};

const emptyStyle: CSSProperties = {
  alignItems: "center",
  color: "var(--text-muted)",
  display: "flex",
  flex: 1,
  justifyContent: "center",
  minHeight: 0,
  padding: 10,
  textAlign: "center",
};

const paneStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
  minHeight: 0,
  minWidth: 0,
  paddingLeft: 12,
};

const notePanelStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1.5px solid var(--border)",
  borderRadius: 8,
  flex: "1 1 auto",
  minHeight: 0,
  overflow: "hidden",
  padding: "10px 10px 9px",
};

const textAreaStyle: CSSProperties = {
  ...monoStyle,
  background: "transparent",
  border: 0,
  color: "var(--text-primary)",
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 700,
  height: "100%",
  lineHeight: 1.28,
  minHeight: 0,
  outline: "none",
  padding: 0,
  resize: "none",
  scrollbarColor: "var(--border) transparent",
  scrollbarWidth: "thin",
  width: "100%",
};

const actionBarStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexShrink: 0,
  gap: 4,
  minHeight: 22,
};

function noteRowStyle(selected: boolean): CSSProperties {
  return {
    alignItems: "center",
    appearance: "none",
    background: selected ? "color-mix(in srgb, var(--accent-cyan) 10%, transparent)" : "transparent",
    border: "1.5px solid var(--border)",
    borderColor: selected ? "var(--accent-cyan)" : "transparent",
    borderRadius: 7,
    boxShadow: "none",
    color: "var(--text-primary)",
    cursor: "pointer",
    display: "flex",
    gap: 6,
    minHeight: 31,
    minWidth: 0,
    padding: "6px 7px",
    textAlign: "left",
    width: "100%",
  };
}

function getNoteTitle(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "Untitled note";
}

export function NotesWidget() {
  const { size } = useWidget();
  const savedNotes = useSyncExternalStore(subscribeNotes, getNotes, getServerNotes);
  const sortedNotes = useMemo(() => sortNotes(savedNotes), [savedNotes]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isLarge = size === "L";
  const selectedNote = sortedNotes.find((note) => note.id === selectedId) ?? sortedNotes[0] ?? null;

  function commitDraft(note: Note, text: string) {
    const cleanText = text.trim();
    if (!cleanText) return;
    if (cleanText !== note.text) updateNote(note.id, cleanText);
  }

  function handleAdd() {
    const note = addNote("Untitled note");
    if (!note) return;
    setSelectedId(note.id);
  }

  function handleSelect(note: Note) {
    setSelectedId(note.id);
  }

  function handleTogglePinned() {
    if (!selectedNote) return;
    togglePinned(selectedNote.id);
  }

  function handleDelete(id: string) {
    const nextNote = sortedNotes.filter((note) => note.id !== id)[0] ?? null;
    deleteNote(id);
    if (selectedNote?.id === id) {
      setSelectedId(nextNote?.id ?? null);
    }
  }

  return (
    <div
      style={{
        ...rootStyle,
        gridTemplateColumns: isLarge
          ? "minmax(168px, 0.68fr) minmax(0, 1.32fr)"
          : "minmax(126px, 0.62fr) minmax(0, 1.38fr)",
      }}
    >
      <aside style={sidebarStyle}>
        <div style={sidebarHeaderStyle}>
          <Square size={11} strokeWidth={1.7} />
          <div className="block-label" style={{ ...labelStyle, marginBottom: 0, minWidth: 0 }}>
            notes
          </div>
          <div style={{ flex: 1 }} />
          <button aria-label="add note" onClick={handleAdd} style={primaryButtonStyle} title="Add note" type="button">
            <Plus size={13} strokeWidth={2} />
          </button>
        </div>

        {sortedNotes.length === 0 ? (
          <div className="block-sub" style={emptyStyle}>
            add a note
          </div>
        ) : (
          <div style={listStyle}>
            {sortedNotes.map((note) => {
              const selected = selectedNote?.id === note.id;
              return (
                <button
                  aria-pressed={selected}
                  key={note.id}
                  onClick={() => handleSelect(note)}
                  style={noteRowStyle(selected)}
                  type="button"
                >
                  <span style={{ color: note.pinned ? "var(--accent-orange)" : "var(--text-muted)", display: "inline-flex", flexShrink: 0 }}>
                    <Pin size={12} strokeWidth={1.8} />
                  </span>
                  <span
                    style={{
                      ...monoStyle,
                      flex: "1 1 auto",
                      fontSize: "0.74rem",
                      fontWeight: selected ? 700 : 600,
                      lineHeight: 1.15,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {getNoteTitle(note.text)}
                  </span>
                  <span
                    style={{
                      ...monoStyle,
                      color: "var(--text-muted)",
                      flexShrink: 0,
                      fontSize: "0.62rem",
                      lineHeight: 1,
                      opacity: 0.82,
                    }}
                  >
                    {timeAgo(note.updatedAt)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <section style={paneStyle}>
        <div style={notePanelStyle}>
          {selectedNote ? (
            <textarea
              aria-label="selected note"
              defaultValue={selectedNote.text}
              key={selectedNote.id}
              onBlur={(event) => {
                const text = event.currentTarget.value;
                if (!text.trim()) {
                  event.currentTarget.value = selectedNote.text;
                  return;
                }
                commitDraft(selectedNote, text);
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              placeholder="Untitled note"
              spellCheck={false}
              style={textAreaStyle}
            />
          ) : (
            <div className="block-sub" style={{ ...emptyStyle, height: "100%", padding: 0 }}>
              no notes yet
            </div>
          )}
        </div>

        <div style={actionBarStyle}>
          <button
            aria-label={selectedNote?.pinned ? "unpin note" : "pin note"}
            disabled={!selectedNote}
            onClick={handleTogglePinned}
            style={{
              ...iconButtonStyle,
              color: selectedNote?.pinned ? "var(--accent-orange)" : "var(--text-muted)",
              cursor: selectedNote ? "pointer" : "default",
              opacity: selectedNote ? 1 : 0.45,
            }}
            title={selectedNote?.pinned ? "Unpin note" : "Pin note"}
            type="button"
          >
            {selectedNote?.pinned ? <PinOff size={13} strokeWidth={1.8} /> : <Pin size={13} strokeWidth={1.8} />}
          </button>
          <button
            aria-label="delete note"
            disabled={!selectedNote}
            onClick={() => {
              if (selectedNote) handleDelete(selectedNote.id);
            }}
            style={{
              ...iconButtonStyle,
              cursor: selectedNote ? "pointer" : "default",
              opacity: selectedNote ? 1 : 0.45,
            }}
            title="Delete note"
            type="button"
          >
            <Trash2 size={13} strokeWidth={1.8} />
          </button>
        </div>
      </section>
    </div>
  );
}

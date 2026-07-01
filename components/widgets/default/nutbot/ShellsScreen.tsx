"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { RealShell } from "@/components/widgets/default/nutbot/RealShell";

type ShellSession = { id: string; title: string };

// counter is module-level so it never resets while the terminal stays mounted,
// giving unique IDs even if sessions are closed and re-opened
let _shellCounter = 1;

export function ShellsScreen() {
  const [sessions, setSessions] = useState<ShellSession[]>([
    { id: "shell-1", title: "shell 1" },
  ]);
  const [activeId, setActiveId] = useState("shell-1");
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  function addSession() {
    _shellCounter += 1;
    const id = `shell-${_shellCounter}`;
    const sess: ShellSession = { id, title: `shell ${_shellCounter}` };
    setSessions((prev) => [...prev, sess]);
    setActiveId(id);
  }

  function closeSession(id: string) {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeRef.current === id && next.length > 0) {
        setActiveId(next[next.length - 1].id);
      }
      return next;
    });
  }

  return (
    <div className="shells-screen">
      <div className="shells-sidebar">
        <div className="shells-sidebar-head">
          <span className="shells-sidebar-label">shells</span>
          <button type="button" className="shells-new-btn" onClick={addSession}>
            + new
          </button>
        </div>
        <div className="shells-list">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`shells-row${activeId === s.id ? " active" : ""}`}
              onClick={() => setActiveId(s.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") setActiveId(s.id); }}
            >
              <span className="shells-row-dot" />
              <span className="shells-row-name">{s.title}</span>
              {sessions.length > 1 && (
                <button
                  type="button"
                  className="shells-row-close"
                  onClick={(e) => { e.stopPropagation(); closeSession(s.id); }}
                  aria-label="close shell"
                >
                  <X size={9} strokeWidth={2} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="shells-main">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="shells-terminal-pane"
            style={{ display: activeId === s.id ? "block" : "none" }}
          >
            <RealShell />
          </div>
        ))}
      </div>
    </div>
  );
}

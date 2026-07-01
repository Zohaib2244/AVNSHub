"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { getPrefs, getServerPrefs, setPrefs, subscribePrefs } from "@/lib/prefs";
import { HARNESS_ADAPTERS, type HarnessId } from "@/lib/widget-creator/harnessAdapters";

type HarnessStatus = { id: HarnessId; label: string; available: boolean };

const HARNESS_IDS: HarnessId[] = ["claude", "codex", "opencode"];

export function NutBotModelPicker() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<HarnessStatus[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/widget-creator/harnesses")
      .then((r) => r.json())
      .then(setStatuses)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function selectModel(model: "bonfire" | HarnessId) {
    if (model === "bonfire") {
      setPrefs({ chatBackend: "bonfire" });
    } else {
      setPrefs({ chatBackend: model, activeHarness: model, creatorEnabled: true });
    }
    setOpen(false);
  }

  const cb = prefs.chatBackend;
  const currentLabel =
    cb === "auto"    ? "auto"
    : cb === "off"   ? "off"
    : cb === "bonfire" ? "bonfire"
    : (HARNESS_ADAPTERS[cb as HarnessId]?.label ?? cb);

  const dotClass =
    cb === "bonfire" ? "nm-dot-orange"
    : cb === "claude" ? "nm-dot-cyan"
    : cb === "codex"  ? "nm-dot-purple"
    : cb === "opencode" ? "nm-dot-green"
    : "nm-dot-muted";

  return (
    <div className="nm-root" ref={rootRef}>
      <button
        type="button"
        className={`nm-pill${open ? " open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="select model"
      >
        <span className={`nm-dot ${dotClass}`} />
        {currentLabel}
        <ChevronDown size={9} strokeWidth={2} className={open ? "nm-chevron open" : "nm-chevron"} />
      </button>

      {open && (
        <div className="nm-dropdown">
          <div className="nm-group-label">local llm</div>
          <button
            type="button"
            className={`nm-opt${cb === "bonfire" ? " active" : ""}`}
            onClick={() => selectModel("bonfire")}
          >
            <span className="nm-dot nm-dot-orange" />
            <span className="nm-opt-text">
              <span className="nm-opt-name">bonfire</span>
              <span className="nm-opt-desc">local llm · chat + plan</span>
            </span>
          </button>

          <div className="nm-sep" />
          <div className="nm-group-label">cloud harness</div>

          {HARNESS_IDS.map((id) => {
            const status = statuses.find((s) => s.id === id);
            const unavailable = status?.available === false;
            const dotCls =
              id === "claude"    ? "nm-dot-cyan"
              : id === "codex"   ? "nm-dot-purple"
              : "nm-dot-green";
            return (
              <button
                key={id}
                type="button"
                className={`nm-opt${cb === id ? " active" : ""}${unavailable ? " unavailable" : ""}`}
                onClick={() => !unavailable && selectModel(id)}
                title={unavailable ? "not found on PATH — install to use" : undefined}
              >
                <span className={`nm-dot ${dotCls}`} />
                <span className="nm-opt-text">
                  <span className="nm-opt-name">{HARNESS_ADAPTERS[id]?.label ?? id}</span>
                  <span className="nm-opt-desc">{unavailable ? "not installed" : "chat + creator"}</span>
                </span>
                {unavailable && <span className="nm-badge">not installed</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

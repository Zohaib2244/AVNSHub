"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import { getPrefs, getServerPrefs, setPrefs, subscribePrefs } from "@/lib/prefs";
import { HARNESS_ADAPTERS, type HarnessId } from "@/lib/widget-creator/harnessAdapters";

type HarnessStatus = { id: HarnessId; label: string; available: boolean };

export function HarnessPill() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<HarnessStatus[]>([]);
  const [dragging, setDragging] = useState<HarnessId | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/widget-creator/harnesses")
      .then((r) => r.json())
      .then(setStatuses)
      .catch(() => {});
  }, []);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function selectHarness(id: HarnessId) {
    setPrefs({ activeHarness: id, creatorEnabled: true });
    setOpen(false);
  }

  function disableCreator() {
    setPrefs({ creatorEnabled: false });
    setOpen(false);
  }

  function reorder(dragId: HarnessId, dropId: HarnessId) {
    if (dragId === dropId) return;
    const chain = [...prefs.harnessChain];
    const from = chain.indexOf(dragId);
    const to = chain.indexOf(dropId);
    if (from === -1 || to === -1) return;
    chain.splice(from, 1);
    chain.splice(to, 0, dragId);
    setPrefs({ harnessChain: chain });
  }

  const creatorOff = !prefs.creatorEnabled;
  const activeLabel = creatorOff ? "creator off" : HARNESS_ADAPTERS[prefs.activeHarness]?.label ?? prefs.activeHarness;
  const activeStatus = creatorOff ? undefined : statuses.find((s) => s.id === prefs.activeHarness);

  return (
    <div className="hp-root" ref={popoverRef}>
      <button
        type="button"
        className={`hp-pill${open ? " open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="select harness"
      >
        <span className={`hp-dot${creatorOff || activeStatus?.available === false ? " unavailable" : ""}`} />
        ⚡ {activeLabel}
        <ChevronDown size={9} strokeWidth={2} className={open ? "hp-chevron open" : "hp-chevron"} />
      </button>

      {open && (
        <div className="hp-popover">
          <div className="hp-popover-head">cli backend</div>
          {prefs.harnessChain.map((id) => {
            const status = statuses.find((s) => s.id === id);
            const available = status?.available !== false;
            return (
              <div
                key={id}
                className={`hp-item${prefs.creatorEnabled && prefs.activeHarness === id ? " active" : ""}${!available ? " unavailable" : ""}`}
                draggable
                onDragStart={() => setDragging(id)}
                onDragOver={(e) => { e.preventDefault(); if (dragging && dragging !== id) reorder(dragging, id); }}
                onDragEnd={() => setDragging(null)}
                onClick={() => available && selectHarness(id)}
                title={available ? undefined : "not found on PATH — install to use"}
              >
                <GripVertical size={10} strokeWidth={1.75} className="hp-grip" />
                <span className={`hp-dot${!available ? " unavailable" : ""}`} />
                <span className="hp-item-label">{HARNESS_ADAPTERS[id]?.label ?? id}</span>
                {!available && <span className="hp-badge">not installed</span>}
                {prefs.creatorEnabled && prefs.activeHarness === id && <span className="hp-badge active">active</span>}
              </div>
            );
          })}
          <div
            className={`hp-item${creatorOff ? " active" : ""}`}
            onClick={disableCreator}
          >
            <span className="hp-dot unavailable" />
            <span className="hp-item-label">off</span>
            {creatorOff && <span className="hp-badge active">active</span>}
          </div>
          <div className="hp-popover-hint">drag to reorder fallback chain</div>
        </div>
      )}
    </div>
  );
}

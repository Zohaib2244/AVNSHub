"use client";

// AVN Hub Canvases — vertical pill buttons stacked on the right edge,
// directly below HubCorePanel's wrench/settings/widgets buttons (rendered
// there, not here — see HubCorePanel.tsx). Mirrors that component's
// "hub-core-btn" sizing/edge-attachment so the whole column reads as one
// continuous dock. Each pill is icon-width by default and grows taller on
// hover to reveal its full name (vertical text) — same hover-expand
// mechanic as the three control buttons above it. The whole canvas list
// collapses behind a chevron toggle to save edge space when there are many.

import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  createCanvas,
  deleteCanvas,
  getCanvases,
  getServerCanvases,
  renameCanvas,
  subscribeCanvases,
  switchCanvas,
  type Canvas,
} from "@/lib/canvases";
import { useLayout } from "@/components/dashboard/LayoutProvider";

function abbreviate(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

export function CanvasSwitcher() {
  const { canvases, activeId } = useSyncExternalStore(subscribeCanvases, getCanvases, getServerCanvases);
  const { activePopover, setActivePopover } = useLayout();
  const [collapsed, setCollapsed] = useState(false);

  function manageKeyFor(id: string) {
    return `canvas-manage:${id}`;
  }

  function handleAdd() {
    const id = createCanvas(`canvas ${canvases.length + 1}`);
    setActivePopover(manageKeyFor(id));
  }

  return (
    <div className="canvas-edge-group">
      <button
        type="button"
        className="hub-core-btn edge-btn canvas-collapse-btn"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "show canvases" : "hide canvases"}
        title={collapsed ? "show canvases" : "hide canvases"}
      >
        {collapsed ? <ChevronUp size={13} strokeWidth={1.75} /> : <ChevronDown size={13} strokeWidth={1.75} />}
        <span className="edge-btn-label">canvases</span>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            className="canvas-pill-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {canvases.map((canvas) => (
              <CanvasPill
                key={canvas.id}
                canvas={canvas}
                active={canvas.id === activeId}
                deletable={canvases.length > 1}
                managing={activePopover === manageKeyFor(canvas.id)}
                onSwitch={() => switchCanvas(canvas.id)}
                onOpenManage={() => setActivePopover(manageKeyFor(canvas.id))}
                onCloseManage={() => setActivePopover(null)}
              />
            ))}
            <button
              type="button"
              className="hub-core-btn edge-btn canvas-add-btn"
              onClick={handleAdd}
              aria-label="add canvas"
              title="add canvas"
            >
              <Plus size={13} strokeWidth={2} />
              <span className="edge-btn-label">new</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CanvasPill({
  canvas,
  active,
  deletable,
  managing,
  onSwitch,
  onOpenManage,
  onCloseManage,
}: {
  canvas: Canvas;
  active: boolean;
  deletable: boolean;
  managing: boolean;
  onSwitch: () => void;
  onOpenManage: () => void;
  onCloseManage: () => void;
}) {
  const [draftName, setDraftName] = useState(canvas.name);

  function openManage() {
    setDraftName(canvas.name);
    onOpenManage();
  }

  function save() {
    renameCanvas(canvas.id, draftName);
    onCloseManage();
  }

  function handleDelete() {
    if (!deletable) return;
    if (!window.confirm(`Delete canvas "${canvas.name}"? Its layout can't be recovered.`)) return;
    deleteCanvas(canvas.id);
    onCloseManage();
  }

  return (
    <div className="canvas-pill-wrap">
      <button
        type="button"
        className={`hub-core-btn edge-btn canvas-pill${active ? " active" : ""}`}
        onClick={onSwitch}
        onDoubleClick={openManage}
        aria-label={`switch to ${canvas.name} canvas`}
        title={`${canvas.name} — double-click to rename`}
      >
        <span className="canvas-pill-glyph">{abbreviate(canvas.name)}</span>
        <span className="edge-btn-label">{canvas.name}</span>
      </button>

      <AnimatePresence>
        {managing && (
          <motion.div
            className="canvas-manage-panel"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <input
              className="canvas-manage-input"
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") onCloseManage();
              }}
              aria-label={`rename ${canvas.name} canvas`}
            />
            <div className="canvas-manage-actions">
              <button type="button" className="hub-core-io-btn" onClick={save}>
                save
              </button>
              {deletable && (
                <button
                  type="button"
                  className="hub-widget-btn danger"
                  onClick={handleDelete}
                  aria-label={`delete ${canvas.name} canvas`}
                  title="delete canvas"
                >
                  <Trash2 size={12} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

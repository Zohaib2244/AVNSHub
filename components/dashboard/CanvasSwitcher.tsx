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
  setCanvasIcon,
  subscribeCanvases,
  switchCanvas,
  type Canvas,
} from "@/lib/canvases";
import { CANVAS_ICONS } from "@/config/canvasIcons";
import { CanvasIconPicker } from "@/components/dashboard/CanvasIconPicker";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { showHubDialog } from "@/lib/hubDialog";
import { getWorkingProjectId } from "@/lib/widget-creator/projectStore";

function abbreviate(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

/** the canvas's chosen icon, or its first-letter-of-name fallback */
export function CanvasGlyph({ canvas }: { canvas: Canvas }) {
  const Icon = canvas.icon ? CANVAS_ICONS[canvas.icon] : undefined;
  if (Icon) return <Icon size={14} strokeWidth={1.75} className="canvas-pill-icon" />;
  return <span className="canvas-pill-glyph">{abbreviate(canvas.name)}</span>;
}

const CREATE_POPOVER_KEY = "canvas-create";

export function CanvasSwitcher() {
  const { canvases, activeId } = useSyncExternalStore(subscribeCanvases, getCanvases, getServerCanvases);
  const { activePopover, setActivePopover } = useLayout();
  const [collapsed, setCollapsed] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftIcon, setDraftIcon] = useState<string | undefined>(undefined);

  function manageKeyFor(id: string) {
    return `canvas-manage:${id}`;
  }

  function handleAdd() {
    setDraftName(`canvas ${canvases.length + 1}`);
    setDraftIcon(undefined);
    setActivePopover(CREATE_POPOVER_KEY);
  }

  function confirmCreate() {
    const id = createCanvas(draftName);
    if (draftIcon) setCanvasIcon(id, draftIcon);
    setActivePopover(null);
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
                onSwitch={() => {
                  if (getWorkingProjectId() !== null) {
                    showHubDialog({
                      title: "switch canvas?",
                      body: "Switching canvas will stop the current widget generation. The active build will be cancelled.",
                      confirmLabel: "switch canvas",
                      onConfirm: () => switchCanvas(canvas.id),
                    });
                  } else {
                    switchCanvas(canvas.id);
                  }
                }}
                onOpenManage={() => setActivePopover(manageKeyFor(canvas.id))}
                onCloseManage={() => setActivePopover(null)}
              />
            ))}
            <div className="canvas-pill-wrap">
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

              <AnimatePresence>
                {activePopover === CREATE_POPOVER_KEY && (
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
                        if (e.key === "Enter") confirmCreate();
                        if (e.key === "Escape") setActivePopover(null);
                      }}
                      aria-label="new canvas name"
                      placeholder="canvas name"
                    />
                    <CanvasIconPicker value={draftIcon} onChange={(icon) => setDraftIcon(icon ?? undefined)} />
                    <div className="canvas-manage-actions">
                      <button type="button" className="hub-core-io-btn" onClick={confirmCreate}>
                        create
                      </button>
                      <button type="button" className="hub-widget-btn" onClick={() => setActivePopover(null)}>
                        x
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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
        <CanvasGlyph canvas={canvas} />
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
            <CanvasIconPicker value={canvas.icon} onChange={(icon) => setCanvasIcon(canvas.id, icon)} />
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

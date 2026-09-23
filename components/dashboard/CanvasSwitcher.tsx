"use client";

// AVN Hub Canvases — the pill row at the left end of Hub Core's control deck
// (rendered there, not here — see HubCorePanel.tsx). Mirrors that component's
// "hub-core-btn" sizing so the whole bar reads as one object. Each pill shows
// its glyph and its name side by side; the deck is horizontal, so names are
// simply visible rather than revealed by a hover-expand.
//
// There is no collapse toggle any more: it existed to save room on the narrow
// right edge, and Hub Core now hides itself wholesale (lib/useDeckAutoHide.ts)
// rather than asking the canvas list to make itself small.

import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
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

/** activePopover key for the new-canvas flyout — exported so the command
    palette can open the same flyout rather than a second create flow */
export const CREATE_POPOVER_KEY = "canvas-create";

/** switch canvas, but ask first if a widget build is running — switching
    cancels it. Shared by the pills and the command palette. */
export function requestCanvasSwitch(id: string) {
  if (getWorkingProjectId() !== null) {
    showHubDialog({
      title: "switch canvas?",
      body: "Switching canvas will stop the current widget generation. The active build will be cancelled.",
      confirmLabel: "switch canvas",
      onConfirm: () => switchCanvas(id),
    });
  } else {
    switchCanvas(id);
  }
}

export function CanvasSwitcher() {
  const { canvases, activeId } = useSyncExternalStore(subscribeCanvases, getCanvases, getServerCanvases);
  const { activePopover, setActivePopover } = useLayout();
  const [draftName, setDraftName] = useState("");
  const [draftIcon, setDraftIcon] = useState<string | undefined>(undefined);

  function manageKeyFor(id: string) {
    return `canvas-manage:${id}`;
  }

  // seed the draft whenever the create flyout opens, however it was opened —
  // the + button here or "new canvas…" in the command palette. Done during
  // render off the popover transition (React's derive-from-props pattern),
  // not in an effect, so the flyout never paints one frame with a stale name.
  const [prevPopover, setPrevPopover] = useState(activePopover);
  if (activePopover !== prevPopover) {
    setPrevPopover(activePopover);
    if (activePopover === CREATE_POPOVER_KEY) {
      setDraftName(`canvas ${canvases.length + 1}`);
      setDraftIcon(undefined);
    }
  }

  function handleAdd() {
    setActivePopover(CREATE_POPOVER_KEY);
  }

  function confirmCreate() {
    const id = createCanvas(draftName);
    if (draftIcon) setCanvasIcon(id, draftIcon);
    setActivePopover(null);
  }

  return (
    <div className="canvas-pill-list">
      {canvases.map((canvas) => (
        <CanvasPill
          key={canvas.id}
          canvas={canvas}
          active={canvas.id === activeId}
          deletable={canvases.length > 1}
          managing={activePopover === manageKeyFor(canvas.id)}
          onSwitch={() => requestCanvasSwitch(canvas.id)}
          onOpenManage={() => setActivePopover(manageKeyFor(canvas.id))}
          onCloseManage={() => setActivePopover(null)}
        />
      ))}
      <div className="canvas-pill-wrap">
        <button
          type="button"
          className="hub-core-btn edge-btn icon-only canvas-add-btn"
          onClick={handleAdd}
          aria-label="add canvas"
          title="add canvas"
        >
          <Plus size={13} strokeWidth={2} />
        </button>

        <AnimatePresence>
          {activePopover === CREATE_POPOVER_KEY && (
            <motion.div
              className="canvas-manage-panel"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
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
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
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

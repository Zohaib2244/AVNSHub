"use client";

// Slot Layout's top-level component (mirrors Dashboard.tsx for Graph Layout).
// Renders the four-region composition — Left | Center (Terminal over Base) |
// Right — inside the same .frame/.frame-inner bezel Graph Layout uses.
//
// The frame's macro proportions (.slot-frame's 3 columns, .slot-center's 2
// rows) are persisted as `frameRatios` (lib/slotLayout.ts) and exposed as
// --col-*/--row-* custom properties consumed by the CSS (styles/globals.css).
// Drag handles on the terminal cell's W/E/S edges adjust those ratios —
// growing the terminal reclaims space from the adjacent column/base and vice
// versa — using the same local-preview-then-commit-on-release pattern as
// SlotWidgetCell's per-widget resize handles.

import { useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Settings2, X } from "lucide-react";
import { getManifest } from "@/config/widgets";
import { HubCorePanel } from "@/components/dashboard/HubCorePanel";
import { FRAME_RATIO_MIN_FR, type FrameRatios } from "@/config/slotLayout";
import {
  getSlotLayout,
  getServerSlotLayout,
  subscribeSlotLayout,
  setFrameRatios,
  setTerminalWidget,
  updateTerminalWidgetSettings,
} from "@/lib/slotLayout";
import type { WidgetInstance } from "@/lib/layout";
import { getCanvases, getServerCanvases, subscribeCanvases } from "@/lib/canvases";
import { terminalSizeClass } from "@/lib/grid/sizeClass";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { SlotRegion } from "@/components/framework/SlotRegion";
import { SlotPlacementPopover } from "@/components/framework/SlotPlacementPopover";
import { WidgetSettingsPopover } from "@/components/framework/WidgetSettingsPopover";
import { WidgetShell } from "@/components/framework/WidgetShell";

/* canvas-switch entrance cascade — NutBot/terminal goes first (STAGGER_BASE,
   which matches the outer .slot-frame's exit-fade duration below so the new
   canvas only starts revealing itself once the old one has fully faded),
   then every other widget follows at increasing delays. Capped so a canvas
   with a lot of widgets doesn't take forever to finish cascading in. */
const STAGGER_BASE = 0.15;
const STAGGER_STEP = 0.045;
const STAGGER_MAX_STEPS = 10;
const WIDGET_OUTRO_DURATION = 0.24;

type RatioAxis = "col-w" | "col-e" | "row-s";

type RatioDragState = {
  axis: RatioAxis;
  pointerId: number;
  startPos: number;
  pxPerFr: number;
  base: FrameRatios;
};

function ratiosEqual(a: FrameRatios, b: FrameRatios) {
  return (
    a.columns[0] === b.columns[0] &&
    a.columns[1] === b.columns[1] &&
    a.columns[2] === b.columns[2] &&
    a.centerRows[0] === b.centerRows[0] &&
    a.centerRows[1] === b.centerRows[1]
  );
}

/** clamp a delta so neither the gaining nor the losing value crosses
    FRAME_RATIO_MIN_FR — the pair's sum stays constant */
function clampPairDelta(deltaFr: number, gain: number, lose: number) {
  return Math.max(FRAME_RATIO_MIN_FR - gain, Math.min(lose - FRAME_RATIO_MIN_FR, deltaFr));
}

export function SlotDashboard() {
  const slotLayout = useSyncExternalStore(subscribeSlotLayout, getSlotLayout, getServerSlotLayout);
  const activeCanvasId = useSyncExternalStore(
    subscribeCanvases,
    () => getCanvases().activeId,
    () => getServerCanvases().activeId,
  );
  const { editMode, activePopover, setActivePopover } = useLayout();
  // shared so it can't stay open alongside another add menu / settings popover
  const terminalPickerKey = "place:terminal";
  const terminalPickerOpen = activePopover === terminalPickerKey;
  const toggleTerminalPicker = () => setActivePopover(terminalPickerOpen ? null : terminalPickerKey);
  const terminalSettingsKey = slotLayout.terminalWidgetId ? `settings:${slotLayout.terminalWidgetId}` : null;
  const terminalSettingsOpen = terminalSettingsKey !== null && activePopover === terminalSettingsKey;

  const frameRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<RatioDragState | null>(null);
  const [previewRatios, setPreviewRatios] = useState<FrameRatios | null>(null);

  const left = slotLayout.widgets.filter((w) => w.region === "left");
  const right = slotLayout.widgets.filter((w) => w.region === "right");
  const base = slotLayout.widgets.filter((w) => w.region === "base");

  const terminalManifest = slotLayout.terminalWidgetId ? (getManifest(slotLayout.terminalWidgetId) ?? null) : null;
  const terminalConfig = terminalManifest ? terminalSizeClass(terminalManifest.sizes, terminalManifest.orientations) : null;
  const terminalSettingsInstance: WidgetInstance | null =
    terminalManifest && terminalConfig
      ? {
          id: terminalManifest.id,
          size: terminalConfig.size,
          orientation: terminalConfig.orientation,
          hidden: false,
          settings: slotLayout.terminalSettings,
        }
      : null;

  // NutBot/terminal is always first in the cascade; every other widget
  // follows in slotLayout.widgets order at increasing delays
  const entranceDelays: Record<string, number> = {};
  slotLayout.widgets.forEach((w, i) => {
    entranceDelays[w.id] = STAGGER_BASE + Math.min(i + 1, STAGGER_MAX_STEPS) * STAGGER_STEP;
  });

  const ratios = previewRatios ?? slotLayout.frameRatios;
  const frameStyle = {
    "--col-l": `${ratios.columns[0]}fr`,
    "--col-c": `${ratios.columns[1]}fr`,
    "--col-r": `${ratios.columns[2]}fr`,
  } as CSSProperties;
  const centerStyle = {
    "--row-term": `${ratios.centerRows[0]}fr`,
    "--row-base": `${ratios.centerRows[1]}fr`,
  } as CSSProperties;

  function handleRatioPointerDown(axis: RatioAxis, e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();

    const baseRatios = slotLayout.frameRatios;
    let pxPerFr: number;
    let startPos: number;

    if (axis === "row-s") {
      const el = centerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(el).rowGap) || 12;
      const sum = baseRatios.centerRows[0] + baseRatios.centerRows[1];
      pxPerFr = (rect.height - gap) / sum;
      startPos = e.clientY;
    } else {
      const el = frameRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(el).columnGap) || 12;
      const sum = baseRatios.columns[0] + baseRatios.columns[1] + baseRatios.columns[2];
      pxPerFr = (rect.width - gap * 2) / sum;
      startPos = e.clientX;
    }

    dragRef.current = { axis, pointerId: e.pointerId, startPos, pxPerFr, base: baseRatios };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleRatioPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    const pos = drag.axis === "row-s" ? e.clientY : e.clientX;
    const deltaFr = Math.round((pos - drag.startPos) / drag.pxPerFr);

    let next: FrameRatios = drag.base;
    if (deltaFr !== 0) {
      if (drag.axis === "col-w") {
        const d = clampPairDelta(deltaFr, drag.base.columns[0], drag.base.columns[1]);
        next = {
          columns: [drag.base.columns[0] + d, drag.base.columns[1] - d, drag.base.columns[2]],
          centerRows: drag.base.centerRows,
        };
      } else if (drag.axis === "col-e") {
        const d = clampPairDelta(deltaFr, drag.base.columns[1], drag.base.columns[2]);
        next = {
          columns: [drag.base.columns[0], drag.base.columns[1] + d, drag.base.columns[2] - d],
          centerRows: drag.base.centerRows,
        };
      } else {
        const d = clampPairDelta(deltaFr, drag.base.centerRows[0], drag.base.centerRows[1]);
        next = {
          columns: drag.base.columns,
          centerRows: [drag.base.centerRows[0] + d, drag.base.centerRows[1] - d],
        };
      }
    }

    const nextPreview = ratiosEqual(next, drag.base) ? null : next;
    setPreviewRatios((current) => {
      if (current === null && nextPreview === null) return current;
      if (current && nextPreview && ratiosEqual(current, nextPreview)) return current;
      return nextPreview;
    });
  }

  function handleRatioPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    e.currentTarget.releasePointerCapture(drag.pointerId);
    dragRef.current = null;

    // commit before clearing the preview — same ordering as
    // SlotWidgetCell's resize handles, for the same reason (setFrameRatios
    // notifies useSyncExternalStore listeners, which mustn't happen from
    // inside a setState updater)
    if (previewRatios && !ratiosEqual(previewRatios, drag.base)) {
      setFrameRatios(previewRatios);
    }
    setPreviewRatios(null);
  }

  return (
    <div className="slot-page mx-auto max-w-[1800px] px-5 py-6">
      <div className="frame frame-with-tabs">
        <HubCorePanel />
        <div className="frame-inner">
          {/* keyed by canvas so switching canvases fully unmounts the old
              widget tree (fade out) and mounts the new one (cascade in) —
              even when a widget id happens to exist in both canvases. Only
              opacity is tweened here (no `layout` prop, no measuring), so
              this can't trip the dense-grid reflow loop CLAUDE.md warns
              about; the per-widget scale+stagger lives in WidgetShell. */}
          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeCanvasId}
            ref={frameRef}
            className="slot-frame"
            style={frameStyle}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0.999 }}
            transition={{ duration: WIDGET_OUTRO_DURATION, ease: "linear" }}
          >
            <SlotRegion region="left" instances={left} dims={slotLayout.regionDims.left} entranceDelays={entranceDelays} />

            <div ref={centerRef} className="slot-center" style={centerStyle}>
              <div className={`slot-terminal${editMode ? " editing" : ""}`}>
                {terminalManifest && terminalConfig ? (
                  <>
                    {editMode && (
                      <>
                        <button
                          type="button"
                          className="slot-remove-btn"
                          aria-label={`remove ${terminalManifest.id} from terminal`}
                          onClick={() => setTerminalWidget(null)}
                        >
                          <X size={12} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          className="slot-settings-btn"
                          aria-label={`configure ${terminalManifest.id} widget`}
                          onClick={() => setActivePopover(terminalSettingsOpen ? null : terminalSettingsKey)}
                        >
                          <Settings2 size={12} strokeWidth={1.75} />
                        </button>
                        <AnimatePresence>
                          {terminalSettingsOpen && terminalSettingsInstance && (
                            <WidgetSettingsPopover
                              key="terminal-settings"
                              manifest={terminalManifest}
                              instance={terminalSettingsInstance}
                              onUpdateSettings={updateTerminalWidgetSettings}
                              onHide={() => setTerminalWidget(null)}
                              onClose={() => setActivePopover(null)}
                            />
                          )}
                        </AnimatePresence>
                      </>
                    )}
                    <WidgetShell
                      manifest={terminalManifest}
                      config={{ ...terminalConfig, settings: slotLayout.terminalSettings }}
                      entranceDelay={STAGGER_BASE}
                    />
                  </>
                ) : (
                  <div
                    className={`slot-terminal-empty${editMode ? " editing" : ""}`}
                    role={editMode ? "button" : undefined}
                    tabIndex={editMode ? 0 : undefined}
                    onClick={editMode ? toggleTerminalPicker : undefined}
                    onKeyDown={
                      editMode
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleTerminalPicker();
                            }
                          }
                        : undefined
                    }
                  >
                    {editMode ? "+ add terminal widget" : "no terminal widget"}
                    {terminalPickerOpen && (
                      <SlotPlacementPopover region="terminal" onClose={() => setActivePopover(null)} />
                    )}
                  </div>
                )}
                {editMode && (
                  <>
                    <div
                      className="resize-handle resize-handle-w"
                      onPointerDown={(e) => handleRatioPointerDown("col-w", e)}
                      onPointerMove={handleRatioPointerMove}
                      onPointerUp={handleRatioPointerUp}
                      onPointerCancel={handleRatioPointerUp}
                    />
                    <div
                      className="resize-handle resize-handle-e"
                      onPointerDown={(e) => handleRatioPointerDown("col-e", e)}
                      onPointerMove={handleRatioPointerMove}
                      onPointerUp={handleRatioPointerUp}
                      onPointerCancel={handleRatioPointerUp}
                    />
                    <div
                      className="resize-handle resize-handle-s"
                      onPointerDown={(e) => handleRatioPointerDown("row-s", e)}
                      onPointerMove={handleRatioPointerMove}
                      onPointerUp={handleRatioPointerUp}
                      onPointerCancel={handleRatioPointerUp}
                    />
                  </>
                )}
              </div>
              <SlotRegion region="base" instances={base} dims={slotLayout.regionDims.base} entranceDelays={entranceDelays} />
            </div>

            <SlotRegion region="right" instances={right} dims={slotLayout.regionDims.right} entranceDelays={entranceDelays} />
          </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

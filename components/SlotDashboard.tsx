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
import { X } from "lucide-react";
import { WIDGETS } from "@/config/widgets";
import { FRAME_RATIO_MIN_FR, type FrameRatios } from "@/config/slotLayout";
import { getSlotLayout, getServerSlotLayout, subscribeSlotLayout, setFrameRatios, setTerminalWidget } from "@/lib/slotLayout";
import { terminalSizeClass } from "@/lib/grid/sizeClass";
import { useLayout } from "@/components/LayoutProvider";
import { SlotRegion } from "@/components/framework/SlotRegion";
import { SlotPlacementPopover } from "@/components/framework/SlotPlacementPopover";
import { WidgetShell } from "@/components/framework/WidgetShell";

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
  const { editMode } = useLayout();
  const [terminalPickerOpen, setTerminalPickerOpen] = useState(false);

  const frameRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<RatioDragState | null>(null);
  const [previewRatios, setPreviewRatios] = useState<FrameRatios | null>(null);

  const left = slotLayout.widgets.filter((w) => w.region === "left");
  const right = slotLayout.widgets.filter((w) => w.region === "right");
  const base = slotLayout.widgets.filter((w) => w.region === "base");

  const terminalManifest = slotLayout.terminalWidgetId ? WIDGETS[slotLayout.terminalWidgetId] : null;
  const terminalConfig = terminalManifest ? terminalSizeClass(terminalManifest.sizes, terminalManifest.orientations) : null;

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
    <div className="mx-auto max-w-[1800px] px-5 py-6">
      <div className="frame">
        <div className="frame-inner">
          <div ref={frameRef} className="slot-frame" style={frameStyle}>
            <SlotRegion region="left" instances={left} dims={slotLayout.regionDims.left} />

            <div ref={centerRef} className="slot-center" style={centerStyle}>
              <div className={`slot-terminal${editMode ? " editing" : ""}`}>
                {terminalManifest && terminalConfig ? (
                  <>
                    {editMode && (
                      <button
                        type="button"
                        className="slot-remove-btn"
                        aria-label={`remove ${terminalManifest.id} from terminal`}
                        onClick={() => setTerminalWidget(null)}
                      >
                        <X size={12} strokeWidth={1.75} />
                      </button>
                    )}
                    <WidgetShell manifest={terminalManifest} config={terminalConfig} />
                  </>
                ) : (
                  <div
                    className={`slot-terminal-empty${editMode ? " editing" : ""}`}
                    role={editMode ? "button" : undefined}
                    tabIndex={editMode ? 0 : undefined}
                    onClick={editMode ? () => setTerminalPickerOpen((o) => !o) : undefined}
                    onKeyDown={
                      editMode
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setTerminalPickerOpen((o) => !o);
                            }
                          }
                        : undefined
                    }
                  >
                    {editMode ? "+ add terminal widget" : "no terminal widget"}
                    {terminalPickerOpen && (
                      <SlotPlacementPopover region="terminal" onClose={() => setTerminalPickerOpen(false)} />
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
              <SlotRegion region="base" instances={base} dims={slotLayout.regionDims.base} />
            </div>

            <SlotRegion region="right" instances={right} dims={slotLayout.regionDims.right} />
          </div>
        </div>
      </div>
    </div>
  );
}

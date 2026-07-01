"use client";

// Slot Layout's top-level component (mirrors Dashboard.tsx for Graph Layout).
// Renders the four-region composition — Left | Center (Central Base over
// Base) | Right — inside the same .frame/.frame-inner bezel Graph Layout
// uses. Central Base is a real region like any other (SlotRegion), just one
// that defaults to a single undivided cell — see config/slotLayout.ts.
//
// The frame's macro proportions (.slot-frame's 3 columns, .slot-center's 2
// rows) are persisted as `frameRatios` (lib/slotLayout.ts) and exposed as
// --col-*/--row-* custom properties consumed by the CSS (styles/globals.css).
// Drag handles on Central Base's W/E/S edges adjust those ratios — growing it
// reclaims space from the adjacent column/base and vice versa — using the
// same local-preview-then-commit-on-release pattern as SlotWidgetCell's
// per-widget resize handles.

import { useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HubCorePanel } from "@/components/dashboard/HubCorePanel";
import { FRAME_RATIO_MIN_FR, type FrameRatios } from "@/config/slotLayout";
import { getSlotLayout, getServerSlotLayout, subscribeSlotLayout, setFrameRatios } from "@/lib/slotLayout";
import { getCanvases, getServerCanvases, subscribeCanvases } from "@/lib/canvases";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { SlotRegion } from "@/components/framework/SlotRegion";

// Nearly all space goes to center — left/right columns and base row collapse
// to a hairline so grid gaps still render and the transition feels like a pull
// rather than a hard cut.
const FOCUS_RATIOS: FrameRatios = { columns: [0.05, 1, 0.05], centerRows: [1, 0.05] };

/* canvas-switch entrance cascade — Central Base (NutBot, by default) goes first (STAGGER_BASE,
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
  const { editMode, focusWidgetId, isInstalling, setKeyboardFocusWidgetId } = useLayout();
  const isFocusMode = focusWidgetId !== null;

  const frameRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<RatioDragState | null>(null);
  const [previewRatios, setPreviewRatios] = useState<FrameRatios | null>(null);

  // Track whether focus mode changed THIS render so we apply the animated
  // transition (0.4s) only on the toggle itself, not on every drag/ratio update.
  // Updating a ref during render is intentional here — it's safe (no setState
  // during render) and gives us a reliable "just changed" flag per render.
  const prevIsFocusModeRef = useRef(isFocusMode);
  const focusChanged = prevIsFocusModeRef.current !== isFocusMode;
  prevIsFocusModeRef.current = isFocusMode;

  const left = slotLayout.widgets.filter((w) => w.region === "left");
  const right = slotLayout.widgets.filter((w) => w.region === "right");
  const base = slotLayout.widgets.filter((w) => w.region === "base");
  const center = slotLayout.widgets.filter((w) => w.region === "center");

  // NutBot/Central Base is always first in the cascade (gets exactly
  // STAGGER_BASE, no added step); every other widget follows in
  // slotLayout.widgets order at increasing delays
  const entranceDelays: Record<string, number> = {};
  let staggerStep = 0;
  for (const w of slotLayout.widgets) {
    entranceDelays[w.id] =
      w.region === "center" ? STAGGER_BASE : STAGGER_BASE + Math.min(++staggerStep, STAGGER_MAX_STEPS) * STAGGER_STEP;
  }

  const ratios = previewRatios ?? slotLayout.frameRatios;
  // In focus mode use collapsed side/base ratios; otherwise use the persisted
  // (or drag-preview) ratios.
  const activeRatios = isFocusMode ? FOCUS_RATIOS : ratios;

  // Framer-motion animates the grid template values by interpolating the
  // numbers inside the string (its "complex" type). Duration is 0.4s only on
  // the render where focus mode actually toggles; every other update (drag
  // preview, canvas switch) is instant so drag handles stay snappy.
  const layoutTransition = focusChanged
    ? ({ duration: 0.4, ease: [0.4, 0, 0.2, 1] } as const)
    : ({ duration: 0 } as const);

  const animateFrameCols = `${activeRatios.columns[0]}fr ${activeRatios.columns[1]}fr ${activeRatios.columns[2]}fr`;
  const animateCenterRows = `${activeRatios.centerRows[0]}fr ${activeRatios.centerRows[1]}fr`;

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
    <div className="slot-page mx-auto max-w-[1800px] px-5 py-6" style={{ position: "relative" }}>
      <div className="frame frame-with-tabs">
        <HubCorePanel />
        <div
          className="frame-inner"
          onPointerDown={(e) => {
            // clicking the bare canvas background clears keyboard widget focus;
            // clicks on a widget bubble up but are caught by data-kb-widget check
            if (!(e.target as Element).closest("[data-kb-widget]")) {
              setKeyboardFocusWidgetId(null);
            }
          }}
        >
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
            data-focus-mode={isFocusMode ? "true" : undefined}
            data-installing={isInstalling ? "true" : undefined}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1, gridTemplateColumns: animateFrameCols }}
            exit={{ opacity: 0.999 }}
            transition={{
              opacity: { duration: WIDGET_OUTRO_DURATION, ease: "linear" },
              gridTemplateColumns: layoutTransition,
            }}
          >
            <SlotRegion region="left" instances={left} dims={slotLayout.regionDims.left} entranceDelays={entranceDelays} inFocusMode={isFocusMode} />

            <motion.div
              ref={centerRef}
              className="slot-center"
              animate={{ gridTemplateRows: animateCenterRows }}
              transition={layoutTransition}
            >
              <div className="slot-center-region">
                <SlotRegion region="center" instances={center} dims={slotLayout.regionDims.center} entranceDelays={entranceDelays} />
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
              <SlotRegion region="base" instances={base} dims={slotLayout.regionDims.base} entranceDelays={entranceDelays} inFocusMode={isFocusMode} />
            </motion.div>

            <SlotRegion region="right" instances={right} dims={slotLayout.regionDims.right} entranceDelays={entranceDelays} inFocusMode={isFocusMode} />
          </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {isInstalling && (
        <div className="installing-overlay" aria-live="polite" role="status">
          <div className="installing-badge">
            <div className="installing-dots">
              <span className="installing-dot" />
              <span className="installing-dot" />
              <span className="installing-dot" />
            </div>
            <span className="installing-badge-label">installing widget</span>
            <span className="installing-badge-sub">page will refresh&hellip;</span>
          </div>
        </div>
      )}
    </div>
  );
}

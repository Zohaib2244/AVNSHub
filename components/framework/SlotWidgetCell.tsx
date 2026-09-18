"use client";

// One placed widget inside a SlotRegion. Derives the widget's S/M/L size +
// h/v orientation from its cell's real pixel box (lib/grid/sizeClass.ts)
// and renders it through the same WidgetShell Graph Layout uses — existing
// widget content components need zero changes to work here. In edit mode, a
// remove button returns the widget to the unplaced pool, a move handle
// repositions it, and four edge handles let the user drag-resize the footprint
// cell-by-cell.

import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence } from "framer-motion";
import { Move, Settings2, X } from "lucide-react";
import { getManifest } from "@/config/widgets";
import { minFootprint } from "@/config/slotLayout";
import { getSlotLayout, removeWidget, setWidgetRect, updateWidgetSettings, type SlotWidgetInstance } from "@/lib/slotLayout";
import type { WidgetInstance } from "@/lib/layout";
import { minPixelSize, sizeClassForFootprint } from "@/lib/grid/sizeClass";
import { buildOccupancy, canPlace, growRect, shrinkRect, maxGrowth, type Direction, type Rect } from "@/lib/grid/occupancy";
import type { HoverExpandEffect } from "@/lib/grid/hoverExpand";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import type { HoverGridMetrics } from "@/components/framework/SlotRegion";
import { WidgetSettingsPopover } from "@/components/framework/WidgetSettingsPopover";
import { WidgetShell } from "@/components/framework/WidgetShell";

const DIRECTIONS: Direction[] = ["n", "s", "e", "w"];

/** Hover On Expand FLIP transition duration — matches .slot-cell's
    left/top/width/height transition in globals.css */
const FLIP_DURATION_MS = 400;

/** Origin that `position: fixed` actually resolves against for `el`.
    A fixed element is only viewport-positioned while no ancestor creates a
    containing block — and the canvas .frame carries a backdrop-filter, which
    does exactly that. Without subtracting this origin the popped-out widget
    lands offset by the frame's own position: shifted down-right, clipping the
    canvas edge on one side and leaving a gap on the other. */
function fixedOrigin(el: HTMLElement): { x: number; y: number } {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const cs = getComputedStyle(node);
    if (
      cs.transform !== "none" ||
      cs.perspective !== "none" ||
      cs.filter !== "none" ||
      cs.backdropFilter !== "none" ||
      /transform|filter|perspective/.test(cs.willChange) ||
      /paint|layout|strict|content/.test(cs.contain)
    ) {
      const rect = node.getBoundingClientRect();
      // fixed resolves against that ancestor's *padding* box
      return { x: rect.left + parseFloat(cs.borderLeftWidth || "0"), y: rect.top + parseFloat(cs.borderTopWidth || "0") };
    }
  }
  return { x: 0, y: 0 };
}

/** a viewport rect expressed in the coordinates `position: fixed` uses here */
function fixedBox(cell: HTMLElement, target: DOMRect) {
  const origin = fixedOrigin(cell);
  return { left: target.left - origin.x, top: target.top - origin.y, width: target.width, height: target.height };
}

type DragState = {
  mode: "move" | "resize";
  direction?: Direction;
  pointerId: number;
  startX: number;
  startY: number;
  pitchX: number;
  pitchY: number;
  dims: { cols: number; rows: number };
  occupancy: boolean[][];
  baseRect: Rect;
  min: { colSpan: number; rowSpan: number };
};

function rectsEqual(a: Rect, b: Rect) {
  return a.col === b.col && a.row === b.row && a.colSpan === b.colSpan && a.rowSpan === b.rowSpan;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function directionsFromPointer(e: ReactPointerEvent<HTMLElement>): Direction[] {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const horizontal = [
    { direction: "w" as const, distance: x },
    { direction: "e" as const, distance: rect.width - x },
  ];
  const vertical = [
    { direction: "n" as const, distance: y },
    { direction: "s" as const, distance: rect.height - y },
  ];

  return [...horizontal.sort((a, b) => a.distance - b.distance), ...vertical.sort((a, b) => a.distance - b.distance)].map(
    (entry) => entry.direction,
  );
}

function hoverBoxStyle(rect: Rect, metrics: HoverGridMetrics): CSSProperties {
  const xPitch = metrics.trackWidth + metrics.gap;
  const yPitch = metrics.trackHeight + metrics.gap;
  return {
    position: "absolute",
    left: rect.col * xPitch,
    top: rect.row * yPitch,
    width: rect.colSpan * metrics.trackWidth + Math.max(0, rect.colSpan - 1) * metrics.gap,
    height: rect.rowSpan * metrics.trackHeight + Math.max(0, rect.rowSpan - 1) * metrics.gap,
  };
}

export function SlotWidgetCell({
  instance,
  hoverEffect,
  hoverMetrics,
  trackMetrics,
  onHoverIntent,
  onHoverExit,
  entranceDelay,
}: {
  instance: SlotWidgetInstance;
  hoverEffect?: HoverExpandEffect;
  hoverMetrics?: HoverGridMetrics;
  /** the region's measured track size — always present once measured, unlike
      hoverMetrics which only exists during a hover-expand */
  trackMetrics?: HoverGridMetrics;
  onHoverIntent?: (id: string, preferredDirections: Direction[]) => void;
  onHoverExit?: () => void;
  /** forwarded straight to WidgetShell — see its prop comment */
  entranceDelay?: number;
}) {
  const { editMode, activePopover, setActivePopover, focusWidgetId } = useLayout();
  const manifest = getManifest(instance.id);
  const cellRef = useRef<HTMLDivElement>(null);
  // the settings panel portals to document.body and positions itself against
  // this button's viewport rect
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);
  // shared so opening one widget's settings closes any other open popover
  const popoverKey = `settings:${instance.id}`;
  const settingsOpen = activePopover === popoverKey;
  const activeHoverEffect = hoverEffect && hoverMetrics ? hoverEffect : undefined;

  const persistedRect: Rect = { col: instance.col, row: instance.row, colSpan: instance.colSpan, rowSpan: instance.rowSpan };
  const rect = activeHoverEffect?.visualRect ?? previewRect ?? persistedRect;

  // ── focus mode ("expand" on NutBot) ────────────────────────────────
  // The widget lifts out of its cell and grows over the canvas instead of
  // squeezing the rest of the grid: its slot stays reserved (placement is
  // explicit, so the empty area doesn't reflow anything), the card goes
  // `position: fixed` at the exact pixels it already occupied, and the next
  // frame retargets it to the frame's box — .slot-cell already transitions
  // left/top/width/height, so that reads as one smooth pop-out. Reversed on
  // exit, back to the rect the cell still owns.
  const focused = focusWidgetId === instance.id;
  const [focusBox, setFocusBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const restingRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const focusRafRef = useRef<number | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);

  const [flip, setFlip] = useState<{ rect: Rect; effect: HoverExpandEffect; metrics: HoverGridMetrics } | null>(null);
  const wasExpandedRef = useRef(false);
  const flipRafRef = useRef<number | null>(null);
  const flipTimeoutRef = useRef<number | null>(null);

  // FLIP-style entry/exit for the hover-expand preview box: position
  // changes always animate from a real "previous frame" value (instead of
  // teleporting when `position` flips between relative/absolute), mirroring
  // DESIGN_VARIATIONS "G"'s always-has-a-resting-value transition pattern.
  useLayoutEffect(() => {
    const clearPending = () => {
      if (flipRafRef.current !== null) {
        cancelAnimationFrame(flipRafRef.current);
        flipRafRef.current = null;
      }
      if (flipTimeoutRef.current !== null) {
        window.clearTimeout(flipTimeoutRef.current);
        flipTimeoutRef.current = null;
      }
    };
    clearPending();

    const resting: Rect = { col: instance.col, row: instance.row, colSpan: instance.colSpan, rowSpan: instance.rowSpan };

    if (activeHoverEffect && hoverMetrics) {
      if (!wasExpandedRef.current) {
        // entry: snap to the resting box (pixel-identical to the grid
        // placement, invisible) then animate to the expand/contract target
        // next frame so the transition has a "from" value to interpolate
        setFlip({ rect: resting, effect: activeHoverEffect, metrics: hoverMetrics });
        flipRafRef.current = requestAnimationFrame(() => {
          flipRafRef.current = null;
          setFlip({ rect: activeHoverEffect.visualRect, effect: activeHoverEffect, metrics: hoverMetrics });
        });
      } else {
        // re-target while already absolute (the hovered edge changed) — the
        // existing transition redirects smoothly mid-flight
        setFlip({ rect: activeHoverEffect.visualRect, effect: activeHoverEffect, metrics: hoverMetrics });
      }
      wasExpandedRef.current = true;
    } else if (wasExpandedRef.current) {
      wasExpandedRef.current = false;
      // exit: animate back to the resting box using the retained effect/metrics
      // (so classes/data-attrs persist through the exit animation), then drop
      // absolute positioning once the transition finishes
      setFlip((prev) => (prev ? { rect: resting, effect: prev.effect, metrics: prev.metrics } : null));
      flipTimeoutRef.current = window.setTimeout(() => {
        flipTimeoutRef.current = null;
        setFlip(null);
      }, FLIP_DURATION_MS);
    }

    return clearPending;
  }, [activeHoverEffect, hoverMetrics, instance.col, instance.row, instance.colSpan, instance.rowSpan]);

  useLayoutEffect(() => {
    const clearPending = () => {
      if (focusRafRef.current !== null) cancelAnimationFrame(focusRafRef.current);
      if (focusTimeoutRef.current !== null) window.clearTimeout(focusTimeoutRef.current);
      focusRafRef.current = null;
      focusTimeoutRef.current = null;
    };
    clearPending();

    const cell = cellRef.current;
    if (!cell) return;

    if (focused) {
      const resting = fixedBox(cell, cell.getBoundingClientRect());
      restingRectRef.current = resting;
      setFocusBox(resting);
      focusRafRef.current = requestAnimationFrame(() => {
        focusRafRef.current = null;
        const frame = cell.closest(".slot-frame")?.getBoundingClientRect();
        if (!frame) return;
        setFocusBox(fixedBox(cell, frame));
      });
    } else if (restingRectRef.current) {
      // animate home, then hand the card back to the grid
      setFocusBox(restingRectRef.current);
      focusTimeoutRef.current = window.setTimeout(() => {
        focusTimeoutRef.current = null;
        restingRectRef.current = null;
        setFocusBox(null);
      }, FLIP_DURATION_MS);
    }

    return clearPending;
  }, [focused]);

  // keep the grown card matching the frame while focused (window resize, or
  // the frame-ratio handles being dragged underneath it)
  useLayoutEffect(() => {
    if (!focused) return;
    const onResize = () => {
      const cell = cellRef.current;
      const frame = cell?.closest(".slot-frame")?.getBoundingClientRect();
      if (cell && frame) setFocusBox(fixedBox(cell, frame));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [focused]);

  // Bail out for an unregistered id only AFTER every hook above has run —
  // an early return placed among them makes the hook order conditional
  // (react-hooks/rules-of-hooks). No hook here reads `manifest`, and the
  // first use of it is sizeClassForFootprint below, so this is the earliest
  // legal exit.
  if (!manifest) return null;

  const effectiveHoverEffect = activeHoverEffect ?? flip?.effect;
  const effectiveHoverMetrics = hoverMetrics ?? flip?.metrics;

  const regionDims = getSlotLayout().regionDims[instance.region];
  // Footprint the widget's *content* is sized against — deliberately NOT the
  // hover-expand visual rect.
  //
  // Hover On Expand is a transient preview: the cell's box grows, but the
  // widget inside must keep rendering the same markup throughout. Feeding
  // `visualRect` in here meant an expand that crossed into "L" swapped the
  // per-size layout on the animation's very first frame — and because the two
  // detail branches in WidgetShell are gated on `size === "L"` / `size !== "L"`,
  // it also unmounted the always-mounted HOE panel and mounted a fresh
  // <Detail /> in its place. That is the exact mount/unmount pop the HOE panel
  // exists to avoid, and it landed a full subtree mount (for NutBot, the whole
  // terminal) on the frame where smoothness matters most.
  //
  // A drag-resize still feeds it: that gesture really is changing the
  // footprint, so re-laying-out as the user drags is the correct feedback.
  const contentRect: Rect = previewRect ?? persistedRect;
  const contentPx = trackMetrics
    ? {
        width: contentRect.colSpan * trackMetrics.trackWidth + Math.max(0, contentRect.colSpan - 1) * trackMetrics.gap,
        height: contentRect.rowSpan * trackMetrics.trackHeight + Math.max(0, contentRect.rowSpan - 1) * trackMetrics.gap,
      }
    : null;
  const { size, orientation } = sizeClassForFootprint(
    { colSpan: contentRect.colSpan, rowSpan: contentRect.rowSpan },
    regionDims,
    manifest.sizes,
    manifest.orientations,
    contentPx,
  );
  const settingsInstance: WidgetInstance = {
    id: instance.id,
    size,
    orientation,
    hidden: false,
    settings: instance.settings,
  };

  function startDrag(mode: DragState["mode"], e: ReactPointerEvent<HTMLElement>, direction?: Direction) {
    onHoverExit?.();
    e.preventDefault();
    e.stopPropagation();
    const region = cellRef.current?.closest<HTMLElement>(".slot-region");
    if (!region) return;

    const slotLayout = getSlotLayout();
    const dims = slotLayout.regionDims[instance.region];
    const regionRect = region.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(region).columnGap) || 12;
    const pitchX = (regionRect.width + gap) / dims.cols;
    const pitchY = (regionRect.height + gap) / dims.rows;

    // convert the widget's minimum pixel box into a cell-span floor at the
    // current pitch: n spans cover n * pitch - gap px, so n >= (px + gap) / pitch
    const spanMin = minFootprint(instance.id);
    const pxMin = manifest ? minPixelSize(manifest.sizes, manifest.minPx) : null;
    const min = pxMin
      ? {
          colSpan: Math.max(spanMin.colSpan, Math.ceil((pxMin.width + gap) / pitchX - 0.01)),
          rowSpan: Math.max(spanMin.rowSpan, Math.ceil((pxMin.height + gap) / pitchY - 0.01)),
        }
      : { ...spanMin };
    // never above the current footprint: a widget already placed below its
    // floor (placed before the floor existed, or squeezed by a region/screen
    // change) must not "shrink" into a bigger rect that could overlap
    // neighbours — it just can't get any smaller
    min.colSpan = Math.min(min.colSpan, persistedRect.colSpan);
    min.rowSpan = Math.min(min.rowSpan, persistedRect.rowSpan);

    const siblings: Rect[] = slotLayout.widgets
      .filter((w) => w.region === instance.region)
      .map((w) => ({ col: w.col, row: w.row, colSpan: w.colSpan, rowSpan: w.rowSpan }));

    dragRef.current = {
      mode,
      direction,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      pitchX,
      pitchY,
      dims,
      occupancy: buildOccupancy(dims, siblings, persistedRect),
      baseRect: persistedRect,
      min,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    const deltaCellsX = Math.round((e.clientX - drag.startX) / drag.pitchX);
    const deltaCellsY = Math.round((e.clientY - drag.startY) / drag.pitchY);

    if (drag.mode === "move") {
      const next: Rect = {
        ...drag.baseRect,
        col: clamp(drag.baseRect.col + deltaCellsX, 0, drag.dims.cols - drag.baseRect.colSpan),
        row: clamp(drag.baseRect.row + deltaCellsY, 0, drag.dims.rows - drag.baseRect.rowSpan),
      };
      const nextPreview = !rectsEqual(next, drag.baseRect) && canPlace(next, drag.dims, drag.occupancy) ? next : null;
      setPreviewRect((current) => {
        if (current === null && nextPreview === null) return current;
        if (current && nextPreview && rectsEqual(current, nextPreview)) return current;
        return nextPreview;
      });
      return;
    }

    if (!drag.direction) return;
    let outward = 0;
    if (drag.direction === "e") outward = deltaCellsX;
    else if (drag.direction === "w") outward = -deltaCellsX;
    else if (drag.direction === "s") outward = deltaCellsY;
    else outward = -deltaCellsY;

    let next: Rect = drag.baseRect;
    if (outward > 0) {
      const grow = Math.min(outward, maxGrowth(drag.baseRect, drag.direction, drag.dims, drag.occupancy));
      next = growRect(drag.baseRect, drag.direction, grow);
    } else if (outward < 0) {
      next = shrinkRect(drag.baseRect, drag.direction, -outward, drag.min);
    }

    const nextPreview = rectsEqual(next, drag.baseRect) ? null : next;
    setPreviewRect((current) => {
      if (current === null && nextPreview === null) return current;
      if (current && nextPreview && rectsEqual(current, nextPreview)) return current;
      return nextPreview;
    });
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    e.currentTarget.releasePointerCapture(drag.pointerId);
    dragRef.current = null;

    // commit before clearing the preview — setWidgetRect notifies
    // SlotDashboard's useSyncExternalStore listener, which must not happen
    // from inside a setState updater (that runs during this component's
    // render/reconciliation and trips React's cross-component setState check)
    if (previewRect && !rectsEqual(previewRect, persistedRect)) {
      setWidgetRect(instance.id, previewRect);
    }
    setPreviewRect(null);
  }

  function handleHoverPointerEnter(e: ReactPointerEvent<HTMLDivElement>) {
    if (editMode || previewRect || e.pointerType === "touch") return;
    onHoverIntent?.(instance.id, directionsFromPointer(e));
  }

  // Exits are owned by SlotRegion's pointermove tracking (sticky "still inside"
  // + debounced exit + region pointerleave). The cell does NOT clear on its own
  // pointerleave: doing so fired an abrupt clear-to-resting the instant the
  // pointer crossed into a neighbor, which is what made handoffs flash back to
  // default size before re-expanding.

  const hoverStyle = flip && effectiveHoverMetrics ? hoverBoxStyle(flip.rect, effectiveHoverMetrics) : null;
  // focus wins over a hover-expand preview: both position the same box
  const focusStyle: CSSProperties | null = focusBox
    ? { position: "fixed", left: focusBox.left, top: focusBox.top, width: focusBox.width, height: focusBox.height, zIndex: 60 }
    : null;

  // clamp the grid placement to the region's track count so a stale/oversized
  // rect (e.g. left over from a region shrink or an interrupted resize) can
  // never reference an implicit track outside the region and overflow it
  const safeColSpan = Math.max(1, Math.min(rect.colSpan, regionDims.cols));
  const safeRowSpan = Math.max(1, Math.min(rect.rowSpan, regionDims.rows));
  const safeCol = Math.min(Math.max(0, rect.col), regionDims.cols - safeColSpan);
  const safeRow = Math.min(Math.max(0, rect.row), regionDims.rows - safeRowSpan);

  return (
    <div
      ref={cellRef}
      className={`slot-cell${editMode ? " editing" : ""}${previewRect ? " resizing" : ""}${
        effectiveHoverEffect ? ` hover-${effectiveHoverEffect.state}` : ""
      }${focusBox ? " focused" : ""}`}
      data-hover-expand={effectiveHoverEffect?.state}
      style={{
        // the grid placement stays set while focused so the slot is still
        // reserved — the fixed positioning below just lifts the card out of it
        gridColumn: hoverStyle ? undefined : `${safeCol + 1} / span ${safeColSpan}`,
        gridRow: hoverStyle ? undefined : `${safeRow + 1} / span ${safeRowSpan}`,
        ...hoverStyle,
        ...focusStyle,
      }}
      onPointerEnter={handleHoverPointerEnter}
    >
      {/* Edit-mode controls stay mounted but inert (CSS hides them and turns
          off pointer-events until .slot-cell.editing) so entering/leaving edit
          mode can fade them in/out instead of popping — a mount/unmount can't
          be CSS-transitioned. tabIndex tracks editMode so they leave the tab
          order when hidden. */}
      <button
        type="button"
        className="slot-move-btn"
        aria-label={`move ${instance.id} widget`}
        title="move widget"
        tabIndex={editMode ? 0 : -1}
        aria-hidden={!editMode}
        onPointerDown={(e) => startDrag("move", e)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <Move size={12} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="slot-remove-btn"
        aria-label={`remove ${instance.id} widget`}
        tabIndex={editMode ? 0 : -1}
        aria-hidden={!editMode}
        onClick={() => removeWidget(instance.id)}
      >
        <X size={12} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        ref={settingsBtnRef}
        className="slot-settings-btn"
        aria-label={`configure ${instance.id} widget`}
        tabIndex={editMode ? 0 : -1}
        aria-hidden={!editMode}
        onClick={() => setActivePopover(settingsOpen ? null : popoverKey)}
      >
        <Settings2 size={12} strokeWidth={1.75} />
      </button>
      <AnimatePresence>
        {editMode && settingsOpen && (
          <WidgetSettingsPopover
            key="slot-settings"
            manifest={manifest}
            instance={settingsInstance}
            onUpdateSettings={(settings) => updateWidgetSettings(instance.id, settings)}
            onHide={() => removeWidget(instance.id)}
            onClose={() => setActivePopover(null)}
            anchorRef={settingsBtnRef}
          />
        )}
      </AnimatePresence>
      {DIRECTIONS.map((dir) => (
        <div
          key={dir}
          className={`resize-handle resize-handle-${dir}`}
          onPointerDown={(e) => startDrag("resize", e, dir)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      ))}
      <WidgetShell
        manifest={manifest}
        config={{
          size,
          orientation,
          settings: instance.settings,
          hoverExpanded: activeHoverEffect?.state === "expanded",
          slot: { region: instance.region, colSpan: rect.colSpan, rowSpan: rect.rowSpan },
        }}
        entranceDelay={entranceDelay}
      />
    </div>
  );
}

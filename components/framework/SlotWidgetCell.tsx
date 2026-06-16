"use client";

// One placed widget inside a SlotRegion. Derives the widget's S/M/L size +
// h/v orientation from its persisted cell footprint (lib/grid/sizeClass.ts)
// and renders it through the same WidgetShell Graph Layout uses — existing
// widget content components need zero changes to work here. In edit mode, a
// remove button returns the widget to the unplaced pool, a move handle
// repositions it, and four edge handles let the user drag-resize the footprint
// cell-by-cell.

import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Move, Settings2, X } from "lucide-react";
import { WIDGETS } from "@/config/widgets";
import { minFootprint } from "@/config/slotLayout";
import { getSlotLayout, removeWidget, setWidgetRect, updateWidgetSettings, type SlotWidgetInstance } from "@/lib/slotLayout";
import type { WidgetInstance } from "@/lib/layout";
import { sizeClassForFootprint } from "@/lib/grid/sizeClass";
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
  onHoverIntent,
  onHoverExit,
}: {
  instance: SlotWidgetInstance;
  hoverEffect?: HoverExpandEffect;
  hoverMetrics?: HoverGridMetrics;
  onHoverIntent?: (id: string, preferredDirections: Direction[]) => void;
  onHoverExit?: () => void;
}) {
  const { editMode, activePopover, setActivePopover } = useLayout();
  const manifest = WIDGETS[instance.id];
  const cellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);
  // shared so opening one widget's settings closes any other open popover
  const popoverKey = `settings:${instance.id}`;
  const settingsOpen = activePopover === popoverKey;
  const activeHoverEffect = hoverEffect && hoverMetrics ? hoverEffect : undefined;

  const persistedRect: Rect = { col: instance.col, row: instance.row, colSpan: instance.colSpan, rowSpan: instance.rowSpan };
  const rect = activeHoverEffect?.visualRect ?? previewRect ?? persistedRect;

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

  const effectiveHoverEffect = activeHoverEffect ?? flip?.effect;
  const effectiveHoverMetrics = hoverMetrics ?? flip?.metrics;

  const { size, orientation } = sizeClassForFootprint(
    { colSpan: rect.colSpan, rowSpan: rect.rowSpan },
    manifest.sizes,
    manifest.orientations,
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
      min: minFootprint(instance.id),
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

  return (
    <div
      ref={cellRef}
      className={`slot-cell${editMode ? " editing" : ""}${previewRect ? " resizing" : ""}${
        effectiveHoverEffect ? ` hover-${effectiveHoverEffect.state}` : ""
      }`}
      data-hover-expand={effectiveHoverEffect?.state}
      style={{
        gridColumn: hoverStyle ? undefined : `${rect.col + 1} / span ${rect.colSpan}`,
        gridRow: hoverStyle ? undefined : `${rect.row + 1} / span ${rect.rowSpan}`,
        ...hoverStyle,
      }}
      onPointerEnter={handleHoverPointerEnter}
    >
      {editMode && (
        <>
          <button
            type="button"
            className="slot-move-btn"
            aria-label={`move ${instance.id} widget`}
            title="move widget"
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
            onClick={() => removeWidget(instance.id)}
          >
            <X size={12} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="gear-btn slot-settings-btn"
            aria-label={`configure ${instance.id} widget`}
            onClick={() => setActivePopover(settingsOpen ? null : popoverKey)}
          >
            <Settings2 size={12} strokeWidth={1.75} />
          </button>
          {settingsOpen && (
            <WidgetSettingsPopover
              manifest={manifest}
              instance={settingsInstance}
              mode="slot"
              onUpdateSettings={(settings) => updateWidgetSettings(instance.id, settings)}
              onHide={() => removeWidget(instance.id)}
              onClose={() => setActivePopover(null)}
            />
          )}
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
        </>
      )}
      <WidgetShell
        manifest={manifest}
        config={{
          size,
          orientation,
          settings: instance.settings,
          hoverExpanded: activeHoverEffect?.state === "expanded",
          slot: { region: instance.region, colSpan: rect.colSpan, rowSpan: rect.rowSpan },
        }}
      />
    </div>
  );
}

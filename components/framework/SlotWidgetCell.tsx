"use client";

// One placed widget inside a SlotRegion. Derives the widget's S/M/L size +
// h/v orientation from its persisted cell footprint (lib/grid/sizeClass.ts)
// and renders it through the same WidgetShell Graph Layout uses — existing
// widget content components need zero changes to work here. In edit mode, a
// remove button returns the widget to the unplaced pool, a move handle
// repositions it, and four edge handles let the user drag-resize the footprint
// cell-by-cell.

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Move, X } from "lucide-react";
import { WIDGETS } from "@/config/widgets";
import { minFootprint } from "@/config/slotLayout";
import { removeWidget, setWidgetRect, getSlotLayout, type SlotWidgetInstance } from "@/lib/slotLayout";
import { sizeClassForFootprint } from "@/lib/grid/sizeClass";
import { buildOccupancy, canPlace, growRect, shrinkRect, maxGrowth, type Direction, type Rect } from "@/lib/grid/occupancy";
import { useLayout } from "@/components/LayoutProvider";
import { WidgetShell } from "@/components/framework/WidgetShell";

const DIRECTIONS: Direction[] = ["n", "s", "e", "w"];

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

export function SlotWidgetCell({ instance }: { instance: SlotWidgetInstance }) {
  const { editMode } = useLayout();
  const manifest = WIDGETS[instance.id];
  const cellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);

  const persistedRect: Rect = { col: instance.col, row: instance.row, colSpan: instance.colSpan, rowSpan: instance.rowSpan };
  const rect = previewRect ?? persistedRect;

  const { size, orientation } = sizeClassForFootprint(
    { colSpan: rect.colSpan, rowSpan: rect.rowSpan },
    manifest.sizes,
    manifest.orientations,
  );

  function startDrag(mode: DragState["mode"], e: ReactPointerEvent<HTMLElement>, direction?: Direction) {
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

  return (
    <div
      ref={cellRef}
      className={`slot-cell${editMode ? " editing" : ""}${previewRect ? " resizing" : ""}`}
      style={{
        gridColumn: `${rect.col + 1} / span ${rect.colSpan}`,
        gridRow: `${rect.row + 1} / span ${rect.rowSpan}`,
      }}
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
          slot: { region: instance.region, colSpan: rect.colSpan, rowSpan: rect.rowSpan },
        }}
      />
    </div>
  );
}

"use client";

// One Slot Layout region (left/right column or base) — a cols x rows CSS
// grid (dims from config/slotLayout.ts REGION_GRID) holding each placed
// widget's SlotWidgetCell at its persisted col/row/colSpan/rowSpan. In edit
// mode, every empty cell becomes a click target that opens
// SlotPlacementPopover for picking an unplaced widget.

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { RegionDims, SlotRegionId } from "@/config/slotLayout";
import type { SlotWidgetInstance } from "@/lib/slotLayout";
import type { Direction, Rect } from "@/lib/grid/occupancy";
import { buildOccupancy } from "@/lib/grid/occupancy";
import { createHoverExpandPreview, type HoverExpandAxis, type HoverExpandPreview } from "@/lib/grid/hoverExpand";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { SlotWidgetCell } from "@/components/framework/SlotWidgetCell";
import { SlotPlacementPopover } from "@/components/framework/SlotPlacementPopover";

const HOVER_INTENT_MS = 140;
const EXIT_INTENT_MS = 120;

export type HoverGridMetrics = {
  gap: number;
  trackWidth: number;
  trackHeight: number;
};

function hoverVisualBox(rect: Rect, metrics: HoverGridMetrics) {
  const xPitch = metrics.trackWidth + metrics.gap;
  const yPitch = metrics.trackHeight + metrics.gap;
  return {
    left: rect.col * xPitch,
    top: rect.row * yPitch,
    width: rect.colSpan * metrics.trackWidth + Math.max(0, rect.colSpan - 1) * metrics.gap,
    height: rect.rowSpan * metrics.trackHeight + Math.max(0, rect.rowSpan - 1) * metrics.gap,
  };
}

export function SlotRegion({
  region,
  instances,
  dims,
}: {
  region: SlotRegionId;
  instances: SlotWidgetInstance[];
  dims: RegionDims;
}) {
  const { editMode } = useLayout();
  const regionRef = useRef<HTMLDivElement>(null);
  const hoverIntentRef = useRef<number | null>(null);
  const hoverExitRef = useRef<number | null>(null);
  const [hoverPreview, setHoverPreview] = useState<HoverExpandPreview | null>(null);
  const [hoverMetrics, setHoverMetrics] = useState<HoverGridMetrics | null>(null);

  const hoverItems = instances.map((w) => ({
    id: w.id,
    rect: { col: w.col, row: w.row, colSpan: w.colSpan, rowSpan: w.rowSpan } satisfies Rect,
  }));

  function clearHoverIntent() {
    if (hoverIntentRef.current === null) return;
    window.clearTimeout(hoverIntentRef.current);
    hoverIntentRef.current = null;
  }

  function clearHoverExit() {
    if (hoverExitRef.current === null) return;
    window.clearTimeout(hoverExitRef.current);
    hoverExitRef.current = null;
  }

  function supportsHoverExpand() {
    if (editMode) return false;
    if (typeof window === "undefined") return false;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return true;
  }

  function requestHoverExpand(id: string, preferredDirections: Direction[]) {
    clearHoverIntent();
    const instance = instances.find((w) => w.id === id);
    if (instance?.settings.hoverExpand !== true) return;
    if (!supportsHoverExpand()) return;
    // per-widget axis lock: only borrow space along width, height, or both
    const axis = (instance.settings.hoverExpandAxis as HoverExpandAxis) ?? "both";
    hoverIntentRef.current = window.setTimeout(() => {
      hoverIntentRef.current = null;
      const regionEl = regionRef.current;
      if (!regionEl) return;
      const rect = regionEl.getBoundingClientRect();
      const styles = getComputedStyle(regionEl);
      const gap = parseFloat(styles.columnGap) || 12;
      const preview = createHoverExpandPreview(id, hoverItems, dims, preferredDirections, axis);
      if (!preview) return;
      setHoverMetrics({
        gap,
        trackWidth: (rect.width - gap * (dims.cols - 1)) / dims.cols,
        trackHeight: (rect.height - gap * (dims.rows - 1)) / dims.rows,
      });
      setHoverPreview(preview);
    }, HOVER_INTENT_MS);
  }

  function clearHoverExpand() {
    clearHoverIntent();
    clearHoverExit();
    setHoverPreview(null);
    setHoverMetrics(null);
  }

  const activeHoverPreview = editMode ? null : hoverPreview;
  const activeHoverMetrics = editMode ? null : hoverMetrics;

  function handleRegionPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!activeHoverPreview || !activeHoverMetrics || e.pointerType === "touch") return;

    const activeEffect = activeHoverPreview.effects[activeHoverPreview.activeId];
    const regionEl = regionRef.current;
    if (!activeEffect || !regionEl) return;

    const regionRect = regionEl.getBoundingClientRect();
    const pointerX = e.clientX - regionRect.left;
    const pointerY = e.clientY - regionRect.top;
    const box = hoverVisualBox(activeEffect.visualRect, activeHoverMetrics);
    const buffer = 6;
    const inside =
      pointerX >= box.left - buffer &&
      pointerX <= box.left + box.width + buffer &&
      pointerY >= box.top - buffer &&
      pointerY <= box.top + box.height + buffer;

    if (inside) {
      clearHoverExit();
      return;
    }

    if (hoverExitRef.current !== null) return;
    hoverExitRef.current = window.setTimeout(() => {
      hoverExitRef.current = null;
      clearHoverExpand();
    }, EXIT_INTENT_MS);
  }

  const emptyCells: { col: number; row: number }[] = [];
  if (editMode) {
    const occupancy = buildOccupancy(
      dims,
      instances.map((w) => ({ col: w.col, row: w.row, colSpan: w.colSpan, rowSpan: w.rowSpan })),
    );
    for (let r = 0; r < dims.rows; r++) {
      for (let c = 0; c < dims.cols; c++) {
        if (!occupancy[r][c]) emptyCells.push({ col: c, row: r });
      }
    }
  }

  return (
    <div
      ref={regionRef}
      className={`slot-region slot-region-${region}${activeHoverPreview ? " hover-expanding" : ""}`}
      style={{
        gridTemplateColumns: `repeat(${dims.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${dims.rows}, minmax(0, 1fr))`,
      }}
      onPointerMove={handleRegionPointerMove}
      onPointerLeave={clearHoverExpand}
    >
      {instances.map((instance) => (
        <SlotWidgetCell
          key={instance.id}
          instance={instance}
          hoverEffect={activeHoverPreview?.effects[instance.id]}
          hoverMetrics={activeHoverMetrics ?? undefined}
          onHoverIntent={requestHoverExpand}
          onHoverExit={clearHoverExpand}
        />
      ))}
      {emptyCells.map((cell) => (
        <SlotEmptyCell key={`${cell.col}-${cell.row}`} region={region} cell={cell} />
      ))}
    </div>
  );
}

function SlotEmptyCell({ region, cell }: { region: SlotRegionId; cell: { col: number; row: number } }) {
  // open-state shared via LayoutProvider so a second add-menu (here or
  // elsewhere) auto-closes the first
  const { activePopover, setActivePopover } = useLayout();
  const popoverKey = `place:${region}:${cell.col}-${cell.row}`;
  const open = activePopover === popoverKey;
  const toggle = () => setActivePopover(open ? null : popoverKey);

  return (
    <div
      className="slot-cell-empty"
      style={{ gridColumn: `${cell.col + 1} / span 1`, gridRow: `${cell.row + 1} / span 1` }}
      role="button"
      tabIndex={0}
      aria-label={`place a widget in ${region}`}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      +{open && <SlotPlacementPopover region={region} onClose={() => setActivePopover(null)} />}
    </div>
  );
}

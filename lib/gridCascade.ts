// Cascade engine for "grow" widgets: on hover, a widget bumps one size tier
// (S→M, M→L) and whichever neighbor(s) it displaces shrink by one tier
// (M→S, L→M) to make room — falling back to a "micro" view if a neighbor is
// squeezed to S-span without declaring "S" as a supported size.
//
// Occupancy is read from the resolved grid lines of each widget-slot
// (getComputedStyle().gridColumnStart/End + gridRowStart/End), which the
// browser resolves to real track numbers for `grid-auto-flow: dense`
// auto-placed items — no need to reimplement CSS's packing algorithm.

import { SPAN_MAP, WIDGETS, nextSize, prevSize, type WidgetId, type WidgetSize } from "@/config/widgets";
import type { WidgetInstance } from "@/lib/layout";

export type GridRect = {
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
};

export type CascadeOverride = {
  /** the effective size tier this widget renders at while the cascade is active */
  size: WidgetSize;
  colSpan: number;
  rowSpan: number;
  /** squeezed to S-span without supporting "S" content — render the micro view */
  micro: boolean;
  /** explicit grid anchor for the hovered widget — pins it in place so dense
      re-placement can't move it out from under the pointer (which would fire
      mouseleave → revert → mouseenter → grow → … an oscillation loop) */
  colStart?: number;
  rowStart?: number;
};

/** cascade-grow needs a row-mate to squeeze; not meaningful at 1-2 columns */
const MIN_CASCADE_COLS = 4;

function parseLine(value: string): number | null {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

/** resolved {colStart, colSpan, rowStart, rowSpan} for a widget-slot, or null
    if the grid hasn't resolved line numbers yet (e.g. display:none) */
export function readGridRect(el: Element): GridRect | null {
  const style = getComputedStyle(el);
  const colStart = parseLine(style.gridColumnStart);
  const colEnd = parseLine(style.gridColumnEnd);
  const rowStart = parseLine(style.gridRowStart);
  const rowEnd = parseLine(style.gridRowEnd);
  if (colStart == null || colEnd == null || rowStart == null || rowEnd == null) return null;
  return { colStart, colSpan: colEnd - colStart, rowStart, rowSpan: rowEnd - rowStart };
}

function overlaps(a: GridRect, b: GridRect): boolean {
  return (
    a.colStart < b.colStart + b.colSpan &&
    a.colStart + a.colSpan > b.colStart &&
    a.rowStart < b.rowStart + b.rowSpan &&
    a.rowStart + a.rowSpan > b.rowStart
  );
}

/** Computes the span/size overrides for a hover-grow on `hoveredId`. Returns
    an empty map when there's nothing to do (already at "L", rects missing,
    or the grid is too narrow to cascade). */
export function computeCascade(
  hoveredId: WidgetId,
  visible: WidgetInstance[],
  rects: Map<WidgetId, GridRect>,
  gridCols: number,
): Map<WidgetId, CascadeOverride> {
  const overrides = new Map<WidgetId, CascadeOverride>();
  if (gridCols < MIN_CASCADE_COLS) return overrides;

  const hovered = visible.find((w) => w.id === hoveredId);
  const baseRect = rects.get(hoveredId);
  if (!hovered || !baseRect) return overrides;

  const targetSize = nextSize(hovered.size);
  if (targetSize === hovered.size) return overrides;

  const [targetCols, targetRows] = SPAN_MAP[`${targetSize}-${hovered.orientation}`];
  const colSpan = Math.min(targetCols, gridCols);
  let colStart = baseRect.colStart;
  if (colStart + colSpan - 1 > gridCols) colStart = Math.max(1, gridCols - colSpan + 1);

  const claimed: GridRect = { colStart, colSpan, rowStart: baseRect.rowStart, rowSpan: targetRows };

  for (const w of visible) {
    if (w.id === hoveredId) continue;
    const rect = rects.get(w.id);
    // not displaced unless the growth claims a cell this neighbor currently occupies
    if (!rect || !overlaps(rect, claimed) || overlaps(rect, baseRect)) continue;

    const shrunkSize = prevSize(w.size);
    const [shrunkCols, shrunkRows] = SPAN_MAP[`${shrunkSize}-${w.orientation}`];
    const supportedSizes: WidgetSize[] = WIDGETS[w.id].sizes;
    const micro = shrunkSize === "S" && !supportedSizes.includes("S");
    overrides.set(w.id, {
      size: shrunkSize,
      colSpan: Math.min(shrunkCols, gridCols),
      rowSpan: shrunkRows,
      micro,
    });
  }

  // pinned to its measured anchor — the claim always contains the original
  // rect (colStart only ever shifts left to stay in bounds), so the pointer
  // stays inside the grown widget and hover can't oscillate
  overrides.set(hoveredId, {
    size: targetSize,
    colSpan,
    rowSpan: targetRows,
    micro: false,
    colStart,
    rowStart: baseRect.rowStart,
  });
  return overrides;
}

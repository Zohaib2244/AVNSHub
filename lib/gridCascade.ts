// Cascade engine for "grow" widgets: on hover, a widget bumps one size tier
// (S→M, M→L) and whichever neighbor(s) it displaces shrink by one tier
// (M→S, L→M) to make room — falling back to a "micro" view if a neighbor is
// squeezed to S-span without declaring "S" as a supported size.
//
// Occupancy is read from each widget-slot's bounding box mapped onto the
// grid container's resolved track sizes (getComputedStyle().gridTemplate
// Columns/Rows, which the browser resolves to real per-track pixel sizes —
// including implicit `dense`-packed rows — once layout settles). This is
// the actual placement the dense algorithm chose for `grid-auto-flow: dense`
// auto-placed items; getComputedStyle() on the *item* only ever echoes back
// the specified `gridRowStart`/`gridColumnStart` ("span N" / "auto"), never
// the resolved line, so it can't be used directly.

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

/** cumulative pixel offset of each grid line (1-indexed) given each track's
    resolved size and the gap between tracks; line N is the left/top edge of
    track N (with the preceding gap folded in) */
function lineOffsets(tracks: number[], gap: number): number[] {
  const offsets = [0];
  for (const size of tracks) offsets.push(offsets[offsets.length - 1] + size + gap);
  return offsets;
}

/** index (1-based grid line) whose offset matches `target` within rounding
    tolerance, or null if none is close enough */
function findLine(offsets: number[], target: number): number | null {
  for (let i = 0; i < offsets.length; i++) {
    if (Math.abs(offsets[i] - target) < 2) return i + 1;
  }
  return null;
}

/** resolved {colStart, colSpan, rowStart, rowSpan} for a widget-slot, derived
    from its bounding box against the grid container's resolved track sizes —
    or null if the grid hasn't laid out yet (e.g. display:none) */
export function readGridRect(el: Element): GridRect | null {
  const grid = el.parentElement;
  if (!grid) return null;
  const gridStyle = getComputedStyle(grid);
  const colTracks = gridStyle.gridTemplateColumns.split(" ").map(parseFloat);
  const rowTracks = gridStyle.gridTemplateRows.split(" ").map(parseFloat);
  if (colTracks.some(Number.isNaN) || rowTracks.length === 0 || rowTracks.some(Number.isNaN)) return null;
  const colGap = parseFloat(gridStyle.columnGap) || 0;
  const rowGap = parseFloat(gridStyle.rowGap) || 0;

  const gridRect = grid.getBoundingClientRect();
  const itemRect = el.getBoundingClientRect();
  const colOffsets = lineOffsets(colTracks, colGap);
  const rowOffsets = lineOffsets(rowTracks, rowGap);

  const colStart = findLine(colOffsets, itemRect.left - gridRect.left);
  const colEnd = findLine(colOffsets, itemRect.right - gridRect.left + colGap);
  const rowStart = findLine(rowOffsets, itemRect.top - gridRect.top);
  const rowEnd = findLine(rowOffsets, itemRect.bottom - gridRect.top + rowGap);
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

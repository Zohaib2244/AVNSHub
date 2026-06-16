// Pure grid placement/resize math for Slot Layout — zero dependencies (no
// React, no storage, no widget config). This is the reuse seam: the
// persisted drag-resize handler (lib/slotLayout.ts + SlotWidgetCell) and a
// future hover-to-expand feature both call these same functions, the only
// difference being whether the result is committed to storage or held as
// transient local state.

export type Rect = { col: number; row: number; colSpan: number; rowSpan: number };
export type GridDims = { cols: number; rows: number };
export type Direction = "n" | "s" | "e" | "w";

/** rasterize placed rects into a boolean occupancy matrix; `exclude` (e.g.
    "self" during a resize) is matched by value so its own cells read as
    empty and a grown rect can re-claim them */
export function buildOccupancy(dims: GridDims, rects: Rect[], exclude?: Rect): boolean[][] {
  const grid: boolean[][] = Array.from({ length: dims.rows }, () => Array<boolean>(dims.cols).fill(false));
  for (const rect of rects) {
    if (exclude && rectsEqual(rect, exclude)) continue;
    markRect(grid, dims, rect, true);
  }
  return grid;
}

function rectsEqual(a: Rect, b: Rect): boolean {
  return a.col === b.col && a.row === b.row && a.colSpan === b.colSpan && a.rowSpan === b.rowSpan;
}

function markRect(grid: boolean[][], dims: GridDims, rect: Rect, value: boolean) {
  const rowEnd = Math.min(dims.rows, rect.row + rect.rowSpan);
  const colEnd = Math.min(dims.cols, rect.col + rect.colSpan);
  for (let r = Math.max(0, rect.row); r < rowEnd; r++) {
    for (let c = Math.max(0, rect.col); c < colEnd; c++) {
      grid[r][c] = value;
    }
  }
}

/** in-bounds and free of every occupied cell */
export function canPlace(rect: Rect, dims: GridDims, occupancy: boolean[][]): boolean {
  if (rect.col < 0 || rect.row < 0 || rect.colSpan < 1 || rect.rowSpan < 1) return false;
  if (rect.col + rect.colSpan > dims.cols || rect.row + rect.rowSpan > dims.rows) return false;
  for (let r = rect.row; r < rect.row + rect.rowSpan; r++) {
    for (let c = rect.col; c < rect.col + rect.colSpan; c++) {
      if (occupancy[r][c]) return false;
    }
  }
  return true;
}

/** grow a rect's edge outward by `amount` cells (negative/zero is a no-op) */
export function growRect(rect: Rect, direction: Direction, amount: number): Rect {
  if (amount <= 0) return rect;
  switch (direction) {
    case "n":
      return { ...rect, row: rect.row - amount, rowSpan: rect.rowSpan + amount };
    case "s":
      return { ...rect, rowSpan: rect.rowSpan + amount };
    case "w":
      return { ...rect, col: rect.col - amount, colSpan: rect.colSpan + amount };
    case "e":
      return { ...rect, colSpan: rect.colSpan + amount };
  }
}

/** shrink a rect's edge inward by `amount` cells, clamped so it never drops
    below `min` */
export function shrinkRect(
  rect: Rect,
  direction: Direction,
  amount: number,
  min: { colSpan: number; rowSpan: number },
): Rect {
  if (amount <= 0) return rect;
  switch (direction) {
    case "n": {
      const rowSpan = Math.max(min.rowSpan, rect.rowSpan - amount);
      return { ...rect, row: rect.row + (rect.rowSpan - rowSpan), rowSpan };
    }
    case "s":
      return { ...rect, rowSpan: Math.max(min.rowSpan, rect.rowSpan - amount) };
    case "w": {
      const colSpan = Math.max(min.colSpan, rect.colSpan - amount);
      return { ...rect, col: rect.col + (rect.colSpan - colSpan), colSpan };
    }
    case "e":
      return { ...rect, colSpan: Math.max(min.colSpan, rect.colSpan - amount) };
  }
}

/** how many cells `rect` could grow in `direction` before hitting the grid
    bound or an occupied cell — 0 if it can't grow at all */
export function maxGrowth(rect: Rect, direction: Direction, dims: GridDims, occupancy: boolean[][]): number {
  let amount = 0;
  while (canPlace(growRect(rect, direction, amount + 1), dims, occupancy)) {
    amount++;
  }
  return amount;
}

/** true if every rect is in-bounds and no two rects overlap — used by
    sanitize() to validate a stored layout before accepting it */
export function isValidPlacement(dims: GridDims, rects: Rect[]): boolean {
  for (const rect of rects) {
    if (rect.col < 0 || rect.row < 0 || rect.colSpan < 1 || rect.rowSpan < 1) return false;
    if (rect.col + rect.colSpan > dims.cols || rect.row + rect.rowSpan > dims.rows) return false;
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) return false;
    }
  }
  return true;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.col < b.col + b.colSpan && a.col + a.colSpan > b.col && a.row < b.row + b.rowSpan && a.row + a.rowSpan > b.row
  );
}

/** the first empty cell in row-major order, or null if the grid is full */
export function firstEmptyCell(dims: GridDims, occupancy: boolean[][]): { col: number; row: number } | null {
  for (let r = 0; r < dims.rows; r++) {
    for (let c = 0; c < dims.cols; c++) {
      if (!occupancy[r][c]) return { col: c, row: r };
    }
  }
  return null;
}

/** the first position (row-major) where a rect of `footprint` fits without
    overlapping `occupancy` — used by placeWidget() to seat a newly-placed
    widget at its minimum size */
export function findFit(
  dims: GridDims,
  occupancy: boolean[][],
  footprint: { colSpan: number; rowSpan: number },
  preferredCell?: { col: number; row: number },
): { col: number; row: number } | null {
  if (preferredCell) {
    const { col, row } = preferredCell;
    if (
      col + footprint.colSpan <= dims.cols &&
      row + footprint.rowSpan <= dims.rows &&
      canPlace({ col, row, colSpan: footprint.colSpan, rowSpan: footprint.rowSpan }, dims, occupancy)
    ) {
      return { col, row };
    }
  }
  for (let r = 0; r + footprint.rowSpan <= dims.rows; r++) {
    for (let c = 0; c + footprint.colSpan <= dims.cols; c++) {
      if (canPlace({ col: c, row: r, colSpan: footprint.colSpan, rowSpan: footprint.rowSpan }, dims, occupancy)) {
        return { col: c, row: r };
      }
    }
  }
  return null;
}

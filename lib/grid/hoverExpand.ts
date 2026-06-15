// Transient Hover On Expand (HOE) math for Slot Layout.
// This deliberately returns transient visual rects only: no persisted rects,
// no stored layout mutation, and no neighbor-of-neighbor cascade.

import type { Direction, GridDims, Rect } from "@/lib/grid/occupancy";

export type HoverExpandItem = {
  id: string;
  rect: Rect;
};

export type HoverExpandEffect = {
  state: "expanded" | "contracted";
  direction: Direction;
  visualRect: Rect;
};

/** which axes a widget is allowed to borrow space along when it hover-expands */
export type HoverExpandAxis = "width" | "height" | "both";

function axisAllows(axis: HoverExpandAxis, direction: Direction): boolean {
  if (axis === "width") return direction === "e" || direction === "w";
  if (axis === "height") return direction === "n" || direction === "s";
  return true;
}

export type HoverExpandPreview = {
  activeId: string;
  direction: Direction;
  effects: Record<string, HoverExpandEffect>;
};

const BORROW_SPAN = 0.65;
const MIN_CONTRACTED_SPAN = 0.35;
const MIN_BORROW_SPAN = 0.2;

function rangesOverlap(aStart: number, aSpan: number, bStart: number, bSpan: number): boolean {
  return aStart < bStart + bSpan && aStart + aSpan > bStart;
}

function edgeNeighbors(active: Rect, items: HoverExpandItem[], direction: Direction): HoverExpandItem[] {
  return items.filter(({ rect }) => {
    switch (direction) {
      case "e":
        return rect.col === active.col + active.colSpan && rangesOverlap(active.row, active.rowSpan, rect.row, rect.rowSpan);
      case "w":
        return rect.col + rect.colSpan === active.col && rangesOverlap(active.row, active.rowSpan, rect.row, rect.rowSpan);
      case "s":
        return rect.row === active.row + active.rowSpan && rangesOverlap(active.col, active.colSpan, rect.col, rect.colSpan);
      case "n":
        return rect.row + rect.rowSpan === active.row && rangesOverlap(active.col, active.colSpan, rect.col, rect.colSpan);
    }
  });
}

function canExpand(active: Rect, dims: GridDims, direction: Direction): boolean {
  switch (direction) {
    case "e":
      return active.col + active.colSpan < dims.cols;
    case "w":
      return active.col > 0;
    case "s":
      return active.row + active.rowSpan < dims.rows;
    case "n":
      return active.row > 0;
  }
}

function axisSpan(rect: Rect, direction: Direction): number {
  return direction === "e" || direction === "w" ? rect.colSpan : rect.rowSpan;
}

function uniqueDirections(directions: Direction[]): Direction[] {
  const seen = new Set<Direction>();
  return directions.filter((direction) => {
    if (seen.has(direction)) return false;
    seen.add(direction);
    return true;
  });
}

function expandedRect(active: Rect, direction: Direction, borrow: number): Rect {
  switch (direction) {
    case "e":
      return { ...active, colSpan: active.colSpan + borrow };
    case "w":
      return { ...active, col: active.col - borrow, colSpan: active.colSpan + borrow };
    case "s":
      return { ...active, rowSpan: active.rowSpan + borrow };
    case "n":
      return { ...active, row: active.row - borrow, rowSpan: active.rowSpan + borrow };
  }
}

function contractedRect(neighbor: Rect, direction: Direction, borrow: number): Rect {
  switch (direction) {
    case "e":
      return { ...neighbor, col: neighbor.col + borrow, colSpan: neighbor.colSpan - borrow };
    case "w":
      return { ...neighbor, colSpan: neighbor.colSpan - borrow };
    case "s":
      return { ...neighbor, row: neighbor.row + borrow, rowSpan: neighbor.rowSpan - borrow };
    case "n":
      return { ...neighbor, rowSpan: neighbor.rowSpan - borrow };
  }
}

function expandedEffect(active: Rect, direction: Direction, borrow: number): HoverExpandEffect {
  return {
    state: "expanded",
    direction,
    visualRect: expandedRect(active, direction, borrow),
  };
}

function contractedEffect(neighbor: Rect, direction: Direction, borrow: number): HoverExpandEffect {
  return {
    state: "contracted",
    direction,
    visualRect: contractedRect(neighbor, direction, borrow),
  };
}

const HORIZONTAL: Direction[] = ["e", "w"];
const VERTICAL: Direction[] = ["n", "s"];

/** the cell sitting diagonally outside the active rect, in the corner formed
    by horizontal direction `h` and vertical direction `v` */
function cornerCell(active: Rect, h: Direction, v: Direction): { col: number; row: number } {
  return {
    col: h === "e" ? active.col + active.colSpan : active.col - 1,
    row: v === "s" ? active.row + active.rowSpan : active.row - 1,
  };
}

function occupies(rect: Rect, col: number, row: number): boolean {
  return col >= rect.col && col < rect.col + rect.colSpan && row >= rect.row && row < rect.row + rect.rowSpan;
}

/** first preferred direction along `axisDirs` that can grow and has at least
    one edge neighbor to borrow from */
function pickAxisDirection(
  active: Rect,
  candidates: HoverExpandItem[],
  dims: GridDims,
  preferred: Direction[],
  axisDirs: Direction[],
): { direction: Direction; neighbors: HoverExpandItem[] } | null {
  const ordered = uniqueDirections([...preferred, ...axisDirs]).filter((d) => axisDirs.includes(d));
  for (const direction of ordered) {
    if (!canExpand(active, dims, direction)) continue;
    const neighbors = edgeNeighbors(active, candidates, direction);
    if (neighbors.length === 0) continue;
    return { direction, neighbors };
  }
  return null;
}

/** "both" expansion: grow along one horizontal AND one vertical direction at
    once, contracting the edge neighbors on each axis plus the single diagonal
    corner widget the growth would otherwise overlap. Returns null (so the
    caller can fall back to single-axis) when only one axis is viable. */
function createBothAxisPreview(
  activeId: string,
  active: Rect,
  candidates: HoverExpandItem[],
  dims: GridDims,
  preferred: Direction[],
): HoverExpandPreview | null {
  const h = pickAxisDirection(active, candidates, dims, preferred, HORIZONTAL);
  const v = pickAxisDirection(active, candidates, dims, preferred, VERTICAL);
  if (!h || !v) return null;

  const hIds = new Set(h.neighbors.map((n) => n.id));
  const vIds = new Set(v.neighbors.map((n) => n.id));
  const cell = cornerCell(active, h.direction, v.direction);
  // the diagonal corner widget — only a distinct one (a large neighbor already
  // contracted on an edge clears the corner itself when it shifts away)
  const corner = candidates.find((c) => !hIds.has(c.id) && !vIds.has(c.id) && occupies(c.rect, cell.col, cell.row)) ?? null;

  const bx = Math.min(
    BORROW_SPAN,
    ...h.neighbors.map(({ rect }) => rect.colSpan - MIN_CONTRACTED_SPAN),
    corner ? corner.rect.colSpan - MIN_CONTRACTED_SPAN : Infinity,
  );
  const by = Math.min(
    BORROW_SPAN,
    ...v.neighbors.map(({ rect }) => rect.rowSpan - MIN_CONTRACTED_SPAN),
    corner ? corner.rect.rowSpan - MIN_CONTRACTED_SPAN : Infinity,
  );
  if (bx < MIN_BORROW_SPAN || by < MIN_BORROW_SPAN) return null;

  const expanded = expandedRect(expandedRect(active, h.direction, bx), v.direction, by);
  const effects: Record<string, HoverExpandEffect> = {
    [activeId]: { state: "expanded", direction: h.direction, visualRect: expanded },
  };
  for (const neighbor of h.neighbors) effects[neighbor.id] = contractedEffect(neighbor.rect, h.direction, bx);
  for (const neighbor of v.neighbors) effects[neighbor.id] = contractedEffect(neighbor.rect, v.direction, by);
  if (corner) {
    effects[corner.id] = {
      state: "contracted",
      direction: h.direction,
      visualRect: contractedRect(contractedRect(corner.rect, h.direction, bx), v.direction, by),
    };
  }

  return { activeId, direction: h.direction, effects };
}

export function createHoverExpandPreview(
  activeId: string,
  items: HoverExpandItem[],
  dims: GridDims,
  preferredDirections: Direction[],
  axis: HoverExpandAxis = "both",
): HoverExpandPreview | null {
  const activeItem = items.find((item) => item.id === activeId);
  if (!activeItem) return null;
  const candidates = items.filter((item) => item.id !== activeId);

  // "both" grows along two perpendicular axes simultaneously; fall through to
  // the single-axis path when the geometry only supports one direction
  if (axis === "both") {
    const both = createBothAxisPreview(activeId, activeItem.rect, candidates, dims, preferredDirections);
    if (both) return both;
  }

  // honour the widget's axis lock: drop any direction off the allowed axis,
  // so a width-only widget never borrows vertically and vice versa
  const directions = uniqueDirections([...preferredDirections, "e", "s", "w", "n"]).filter((d) =>
    axisAllows(axis, d),
  );

  for (const direction of directions) {
    const active = activeItem.rect;
    if (!canExpand(active, dims, direction)) continue;

    const neighbors = edgeNeighbors(active, candidates, direction);
    if (neighbors.length === 0) continue;

    const maxBorrow = Math.min(
      BORROW_SPAN,
      ...neighbors.map(({ rect }) => axisSpan(rect, direction) - MIN_CONTRACTED_SPAN),
    );
    if (maxBorrow < MIN_BORROW_SPAN) continue;

    const effects: Record<string, HoverExpandEffect> = {
      [activeId]: expandedEffect(active, direction, maxBorrow),
    };
    for (const neighbor of neighbors) {
      effects[neighbor.id] = contractedEffect(neighbor.rect, direction, maxBorrow);
    }

    return { activeId, direction, effects };
  }

  return null;
}

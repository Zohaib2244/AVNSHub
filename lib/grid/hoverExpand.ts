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

export function createHoverExpandPreview(
  activeId: string,
  items: HoverExpandItem[],
  dims: GridDims,
  preferredDirections: Direction[],
): HoverExpandPreview | null {
  const activeItem = items.find((item) => item.id === activeId);
  if (!activeItem) return null;

  const directions = uniqueDirections([...preferredDirections, "e", "s", "w", "n"]);
  const candidates = items.filter((item) => item.id !== activeId);

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

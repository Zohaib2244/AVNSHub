// Slot Layout region config — pure data, mirrors how config/widgets.tsx is
// pure config for the widget registry. Slot Layout divides the page into
// fixed regions (left/right columns, a base grid, and a single terminal
// slot); widgets occupy a manually-placed rectangle of cells within a
// region. See lib/slotLayout.ts for the persisted placement store and
// lib/grid/occupancy.ts for the placement/resize math.

import type { WidgetId } from "@/config/widgets";

export type RegionId = "left" | "right" | "base" | "terminal";

/** the three subdivided regions — terminal is a single fixed slot with no
    occupancy grid, so it's intentionally excluded here */
export type SlotRegionId = Exclude<RegionId, "terminal">;

export type RegionDims = { cols: number; rows: number };

/** default grid dims — also the fallback when a stored layout omits/corrupts
    regionDims (see lib/slotLayout.ts sanitize()) */
export const REGION_GRID: Record<SlotRegionId, RegionDims> = {
  left: { cols: 2, rows: 8 },
  right: { cols: 2, rows: 8 },
  base: { cols: 3, rows: 2 },
};

/** display labels for the AVN Hub Core Settings region-dims editor */
export const REGION_LABELS: Record<SlotRegionId, string> = {
  left: "column l",
  right: "column r",
  base: "base",
};

/** bounds for user-editable region grid dims (AVN Hub Core Settings →
    default mode settings) */
export const REGION_DIMS_BOUNDS = { minCols: 1, maxCols: 6, minRows: 1, maxRows: 12 };

export function clampRegionDims(dims: RegionDims): RegionDims {
  return {
    cols: Math.min(REGION_DIMS_BOUNDS.maxCols, Math.max(REGION_DIMS_BOUNDS.minCols, dims.cols)),
    rows: Math.min(REGION_DIMS_BOUNDS.maxRows, Math.max(REGION_DIMS_BOUNDS.minRows, dims.rows)),
  };
}

export const TERMINAL_REGION = { id: "terminal" as const, defaultWidget: "nutbot" as WidgetId };

/** macro proportions of the slot frame — .slot-frame's 3 columns
    (left | center | right) and .slot-center's 2 rows (terminal | base),
    expressed as integer `fr` units. Defaults mirror the static values the
    CSS originally shipped with (2fr 3fr 2fr / 7fr 3fr). Adjustable via drag
    handles on the terminal cell's edges (see SlotDashboard) — growing the
    terminal reclaims space from the adjacent column/base and vice versa. */
export type FrameRatios = {
  columns: [number, number, number];
  centerRows: [number, number];
};

export const DEFAULT_FRAME_RATIOS: FrameRatios = {
  columns: [2, 3, 2],
  centerRows: [7, 3],
};

/** every fr value must stay >= this so no region can collapse to nothing */
export const FRAME_RATIO_MIN_FR = 1;

/** per-widget minimum footprint a resize can't shrink below; 1x1 if absent */
export const MIN_FOOTPRINT: Partial<Record<WidgetId, { colSpan: number; rowSpan: number }>> = {};

export function minFootprint(id: WidgetId): { colSpan: number; rowSpan: number } {
  return MIN_FOOTPRINT[id] ?? { colSpan: 1, rowSpan: 1 };
}

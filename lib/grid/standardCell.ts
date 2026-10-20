// Standard cell — the unit size presets are measured in (config/sizePresets.ts).
//
// It is the box a side-column cell would have at the default 2x8 grid and
// default frame ratios, on the current screen. Derived from the measured
// .slot-frame only, so it follows the viewport but never a region's grid or a
// frame-ratio drag: changing either resizes regions, not the unit, which is
// what keeps widgets the same visible size across grid changes.
//
// Pure math — the frame box comes from lib/grid/regionMetrics.ts.

import {
  DEFAULT_FRAME_RATIOS,
  REGION_GRID,
  type FrameRatios,
  type RegionDims,
  type SlotRegionId,
} from "@/config/slotLayout";

export type FrameBox = { width: number; height: number; gap: number };

/** a standard cell's box and pitch (box + one gap), in CSS px */
export type StandardCell = {
  width: number;
  height: number;
  pitchX: number;
  pitchY: number;
};

/** a region's real cell pitch (track + gap) and gap, in CSS px */
export type RegionPitch = { x: number; y: number; gap: number };

/** below this .slot-frame collapses to one column (globals.css
    @media (max-width: 1023px)) — keep in sync */
export const STACKED_BREAKPOINT_PX = 1024;

/** .slot-frame measured on a 1920x1080 viewport. Stands in for the real frame
    wherever the real one can't say what a widget's desktop size is: the
    stacked layout (cells there are full-width, content-height rows that
    ignore their rect) and the first render before anything is measured. */
export const REFERENCE_FRAME: FrameBox = { width: 1708, height: 980, gap: 12 };

export function standardCell(frame: FrameBox): StandardCell {
  const { cols, rows } = REGION_GRID.left;
  const gap = frame.gap;
  const [left, center, right] = DEFAULT_FRAME_RATIOS.columns;
  const defaultLeftWidth = ((frame.width - 2 * gap) * left) / (left + center + right);
  const pitchX = (defaultLeftWidth + gap) / cols;
  const pitchY = (frame.height + gap) / rows;
  return { width: pitchX - gap, height: pitchY - gap, pitchX, pitchY };
}

/** each region's pixel box for a desktop frame at the given ratios —
    mirrors .slot-frame (left | center | right columns) and .slot-center
    (Central Base over the base grid) in globals.css */
export function regionBoxes(frame: FrameBox, ratios: FrameRatios): Record<SlotRegionId, { width: number; height: number }> {
  const gap = frame.gap;
  const [l, c, r] = ratios.columns;
  const colUnit = (frame.width - 2 * gap) / (l + c + r);
  const [top, bottom] = ratios.centerRows;
  const rowUnit = (frame.height - gap) / (top + bottom);
  return {
    left: { width: colUnit * l, height: frame.height },
    right: { width: colUnit * r, height: frame.height },
    center: { width: colUnit * c, height: rowUnit * top },
    base: { width: colUnit * c, height: rowUnit * bottom },
  };
}

export function regionPitch(box: { width: number; height: number }, dims: RegionDims, gap: number): RegionPitch {
  return { x: (box.width + gap) / dims.cols, y: (box.height + gap) / dims.rows, gap };
}

/** standard cell + a region's pitch on the reference desktop frame, with the
    user's own region dims and frame ratios — "what this widget is on desktop" */
export function referenceGeometry(
  region: SlotRegionId,
  dims: RegionDims,
  ratios: FrameRatios,
): { sc: StandardCell; pitch: RegionPitch } {
  const box = regionBoxes(REFERENCE_FRAME, ratios)[region];
  return { sc: standardCell(REFERENCE_FRAME), pitch: regionPitch(box, dims, REFERENCE_FRAME.gap) };
}

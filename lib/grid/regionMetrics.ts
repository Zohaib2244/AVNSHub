// Measured slot-frame box, shared outside React — lib/slotLayout.ts is a
// DOM-free store, but re-fitting widgets across grid changes (phase 3 of
// docs/WIDGET_SIZE_PRESETS.md) needs to know how big a standard cell is.
// SlotDashboard reports the frame via ResizeObserver; anything can read the
// derived geometry synchronously or subscribe to it.

import { useSyncExternalStore } from "react";
import type { FrameRatios, RegionDims, SlotRegionId } from "@/config/slotLayout";
import {
  STACKED_BREAKPOINT_PX,
  referenceGeometry,
  regionBoxes,
  regionPitch,
  standardCell,
  type FrameBox,
  type RegionPitch,
  type StandardCell,
} from "@/lib/grid/standardCell";

export type FrameGeometry = {
  frame: FrameBox;
  /** standard cell for the measured frame */
  cell: StandardCell;
  /** below the stacked breakpoint cells are full-width, content-height rows
      that ignore their rect — callers fall back to referenceGeometry */
  stacked: boolean;
};

/** replaced (never mutated) on change, so it is a stable
    useSyncExternalStore snapshot */
let geometry: FrameGeometry | null = null;
const listeners = new Set<() => void>();

/** called by SlotDashboard whenever .slot-frame's box changes; ignores
    no-op reports so subscribers only re-render on a real change */
export function reportFrameBox(next: FrameBox, viewportWidth: number) {
  const frame: FrameBox = { width: Math.round(next.width), height: Math.round(next.height), gap: next.gap };
  const stacked = viewportWidth < STACKED_BREAKPOINT_PX;
  if (
    geometry &&
    geometry.frame.width === frame.width &&
    geometry.frame.height === frame.height &&
    geometry.frame.gap === frame.gap &&
    geometry.stacked === stacked
  ) {
    return;
  }
  geometry = { frame, cell: standardCell(frame), stacked };
  for (const listener of listeners) listener();
}

/** null until the frame has been measured (first render / SSR) */
export function getFrameGeometry(): FrameGeometry | null {
  return geometry;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFrameGeometry(): FrameGeometry | null {
  return useSyncExternalStore(subscribe, getFrameGeometry, () => null);
}

/** standard cell + a region's pitch, computed from the measured frame and the
    canvas's ratios — for code with no DOM of its own (the layout store's
    placement). Falls back to the reference desktop frame when the frame hasn't
    been measured or the layout is stacked, like SlotWidgetCell does. */
export function regionGeometry(
  region: SlotRegionId,
  dims: RegionDims,
  ratios: FrameRatios,
): { sc: StandardCell; pitch: RegionPitch } {
  if (!geometry || geometry.stacked) return referenceGeometry(region, dims, ratios);
  const box = regionBoxes(geometry.frame, ratios)[region];
  return { sc: geometry.cell, pitch: regionPitch(box, dims, geometry.frame.gap) };
}

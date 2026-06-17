// Shared signal for the currently HOE-expanded widget's screen position.
// Written by SlotRegion when a hover-expand preview activates or clears.
// Read each RAF frame by NutBot's idle eye-tracking — no subscription needed.

export type HoeActive = {
  id: string;
  centerX: number; // page coordinates (from getBoundingClientRect)
  centerY: number;
};

let hoeActive: HoeActive | null = null;

export function setHoeActive(data: HoeActive | null) {
  hoeActive = data;
}

export function getHoeActive(): HoeActive | null {
  return hoeActive;
}

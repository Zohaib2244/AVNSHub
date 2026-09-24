// Standard cells ↔ real spans, and which size preset applies to a footprint.
// Pure math over config/sizePresets.ts; see docs/WIDGET_SIZE_PRESETS.md §6.
//
// Everything here takes a region's real grid pitch (track + gap, per axis)
// and the current standard cell, so the same preset resolves to different
// span counts on different grids — 2x2 standard cells is 2x2 at the default
// 2x8 side grid and 4x3 at 4x9 — while covering the same pixels.

import { SIZE_PRESETS, type PresetId, type SizePreset } from "@/config/sizePresets";
import type { RegionDims } from "@/config/slotLayout";
import type { Footprint } from "@/lib/grid/sizeClass";
import type { RegionPitch, StandardCell } from "@/lib/grid/standardCell";

export type { RegionPitch };

/** absorbs sub-pixel rounding in pixel conversions */
const EPSILON = 0.01;

/** How far short of a whole span a standard-cell conversion may fall and
    still count as covering it. Regions' cells are never exactly a standard
    cell — at 1920x1080 a base column is ~2px narrower than a side column —
    so without slack, "2 standard cells" in the base rounds up to 3 columns.
    The readability floor (floorPx) still guards legibility. */
const SPAN_TOLERANCE = 0.1;

/** real spans needed to cover `n` standard cells */
export function spansForSC(n: number, scPitch: number, pitch: number): number {
  return Math.max(1, Math.ceil((n * scPitch) / pitch - SPAN_TOLERANCE));
}

/** real spans needed to cover `px` (n spans cover n * pitch - gap px) —
    the same formula SlotWidgetCell uses for minPx */
export function spansForPx(px: number, pitch: number, gap: number): number {
  return Math.max(1, Math.ceil((px + gap) / pitch - EPSILON));
}

/** most real spans that still fit inside `n` standard cells */
export function maxSpansWithinSC(n: number, scPitch: number, pitch: number): number {
  return Math.max(1, Math.floor((n * scPitch) / pitch + SPAN_TOLERANCE));
}

/** a real footprint expressed in (fractional) standard cells */
export function footprintInSC(footprint: Footprint, pitch: RegionPitch, sc: StandardCell) {
  return {
    cols: (footprint.colSpan * pitch.x) / sc.pitchX,
    rows: (footprint.rowSpan * pitch.y) / sc.pitchY,
  };
}

/** smallest real footprint a preset needs: its standard-cell min, or its
    readability floor if that's bigger. null for hero (no min). */
export function presetMinSpans(preset: SizePreset, pitch: RegionPitch, sc: StandardCell): Footprint | null {
  if (!preset.min) return null;
  let colSpan = spansForSC(preset.min.cols, sc.pitchX, pitch.x);
  let rowSpan = spansForSC(preset.min.rows, sc.pitchY, pitch.y);
  if (preset.floorPx) {
    colSpan = Math.max(colSpan, spansForPx(preset.floorPx.width, pitch.x, pitch.gap));
    rowSpan = Math.max(rowSpan, spansForPx(preset.floorPx.height, pitch.y, pitch.gap));
  }
  return { colSpan, rowSpan };
}

/** largest real footprint a preset allows, never below its min. null for
    hero (unbounded — clamp to the region). */
export function presetMaxSpans(preset: SizePreset, pitch: RegionPitch, sc: StandardCell): Footprint | null {
  if (!preset.max) return null;
  const min = presetMinSpans(preset, pitch, sc);
  return {
    colSpan: Math.max(min?.colSpan ?? 1, maxSpansWithinSC(preset.max.cols, sc.pitchX, pitch.x)),
    rowSpan: Math.max(min?.rowSpan ?? 1, maxSpansWithinSC(preset.max.rows, sc.pitchY, pitch.y)),
  };
}

function fits(inner: Footprint, outer: Footprint) {
  return inner.colSpan <= outer.colSpan && inner.rowSpan <= outer.rowSpan;
}

function scArea(preset: SizePreset) {
  return preset.min ? preset.min.cols * preset.min.rows : 0;
}

export type PresetChoice = {
  preset: PresetId;
  /** true when the footprint is smaller than every declared preset's min —
      on a small screen, or a widget placed narrower than any layout it has
      (e.g. an M/L-only widget in a 1-wide cell); the shell applies the
      below-floor fallback (docs/WIDGET_SIZE_PRESETS.md §8.3) */
  belowFloor: boolean;
};

/** which of a widget's presets applies at a footprint (spec §6.2):
    1. fills the whole region and declares hero → hero
    2. else the declared preset with the largest min that fits
    3. else the smallest declared preset, flagged belowFloor */
export function choosePreset(
  presets: readonly PresetId[],
  footprint: Footprint,
  dims: RegionDims,
  pitch: RegionPitch,
  sc: StandardCell,
): PresetChoice {
  const fillsRegion = footprint.colSpan >= dims.cols && footprint.rowSpan >= dims.rows;
  if (presets.includes("hero") && (fillsRegion || presets.length === 1)) {
    return { preset: "hero", belowFloor: false };
  }

  const ranged = presets.filter((id) => id !== "hero").map((id) => SIZE_PRESETS[id]);
  if (ranged.length === 0) return { preset: presets[0] ?? "card", belowFloor: false };

  let best: SizePreset | null = null;
  for (const preset of ranged) {
    const min = presetMinSpans(preset, pitch, sc);
    if (!min || !fits(min, footprint)) continue;
    // >= so a later (larger) catalog entry wins a tie, e.g. strip over badge at 2x1
    if (!best || scArea(preset) >= scArea(best)) best = preset;
  }
  if (best) return { preset: best.id, belowFloor: false };
  return { preset: ranged[0].id, belowFloor: true };
}

/** true when some declared preset's [min, max] contains the footprint, or the
    footprint fills the region and the widget declares hero */
export function isFootprintAllowed(
  presets: readonly PresetId[],
  footprint: Footprint,
  dims: RegionDims,
  pitch: RegionPitch,
  sc: StandardCell,
): boolean {
  if (presets.includes("hero") && footprint.colSpan >= dims.cols && footprint.rowSpan >= dims.rows) return true;
  return presets.some((id) => {
    const preset = SIZE_PRESETS[id];
    const min = presetMinSpans(preset, pitch, sc);
    const max = presetMaxSpans(preset, pitch, sc);
    if (!min || !max) return false;
    return fits(min, footprint) && fits(footprint, max);
  });
}

/** bounding box of every declared preset's range, clamped to the region —
    the outer limits of a resize drag. Individual footprints inside it still
    need isFootprintAllowed (the union of ranges isn't a rectangle). */
export function resizeBounds(
  presets: readonly PresetId[],
  dims: RegionDims,
  pitch: RegionPitch,
  sc: StandardCell,
): { min: Footprint; max: Footprint } {
  const region: Footprint = { colSpan: dims.cols, rowSpan: dims.rows };
  let min: Footprint | null = null;
  let max: Footprint = { colSpan: 1, rowSpan: 1 };
  for (const id of presets) {
    const preset = SIZE_PRESETS[id];
    const pMin = presetMinSpans(preset, pitch, sc);
    const pMax = presetMaxSpans(preset, pitch, sc) ?? region;
    if (pMin) {
      min = min
        ? { colSpan: Math.min(min.colSpan, pMin.colSpan), rowSpan: Math.min(min.rowSpan, pMin.rowSpan) }
        : pMin;
    }
    max = { colSpan: Math.max(max.colSpan, pMax.colSpan), rowSpan: Math.max(max.rowSpan, pMax.rowSpan) };
  }
  const clamp = (f: Footprint): Footprint => ({
    colSpan: Math.min(f.colSpan, region.colSpan),
    rowSpan: Math.min(f.rowSpan, region.rowSpan),
  });
  return { min: clamp(min ?? { colSpan: 1, rowSpan: 1 }), max: clamp(max) };
}

/** footprints to try, in order, when placing a widget: its default preset's
    min, then its other presets' mins smallest first (so a full-ish region
    still takes it at a size it has a layout for). A hero-only widget takes
    the whole region. Never a footprint no preset allows — unlike the old
    1x1 default, which put every new widget in its S layout. */
export function placementFootprints(
  presets: readonly PresetId[],
  defaultPreset: PresetId,
  dims: RegionDims,
  pitch: RegionPitch,
  sc: StandardCell,
): Footprint[] {
  const region: Footprint = { colSpan: dims.cols, rowSpan: dims.rows };
  const mins = presets
    .map((id) => ({ id, min: presetMinSpans(SIZE_PRESETS[id], pitch, sc) }))
    .filter((p): p is { id: PresetId; min: Footprint } => p.min !== null)
    .map((p) => ({ ...p, min: { colSpan: Math.min(p.min.colSpan, dims.cols), rowSpan: Math.min(p.min.rowSpan, dims.rows) } }));
  const first = mins.find((p) => p.id === defaultPreset)?.min;
  const rest = mins
    .filter((p) => p.id !== defaultPreset)
    .map((p) => p.min)
    .sort((a, b) => a.colSpan * a.rowSpan - b.colSpan * b.rowSpan);
  const out: Footprint[] = [];
  for (const f of [first, ...rest, presets.includes("hero") ? region : undefined]) {
    if (f && !out.some((o) => o.colSpan === f.colSpan && o.rowSpan === f.rowSpan)) out.push(f);
  }
  return out;
}

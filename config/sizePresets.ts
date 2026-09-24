// Size preset catalog — the single source of truth for what sizes a widget
// can be. Pure data, like config/slotLayout.ts. See
// docs/WIDGET_SIZE_PRESETS.md for the full model.
//
// A preset is one layout with a size *range* it must work across. Ranges are
// in standard cells (lib/grid/standardCell.ts): the box a side-column cell has
// at the default 2x8 grid on the current screen. That unit scales with the
// screen but not with a region's grid, so a Card stays the same visible size
// whether the left region is 2x8 or 4x9 — lib/grid/presetFit.ts converts
// standard cells to real spans for whatever grid is in use.

import type { Orientation, WidgetSize } from "./widgets";

export type PresetId = "badge" | "strip" | "column" | "card" | "panel" | "hero";

/** how content fills extra space inside a preset's range: "reflow" grows text
    a little (capped by `scale`) and uses the rest for more content; "scale"
    renders at the preset's min box and scales the whole thing to fit */
export type FillMode = "reflow" | "scale";

export type SCBox = { cols: number; rows: number };
export type PxBox = { width: number; height: number };

export type SizePreset = {
  id: PresetId;
  label: string;
  /** in standard cells; null for hero, which is "the whole region" */
  min: SCBox | null;
  max: SCBox | null;
  /** hard pixel minimum for legibility, on top of `min` — only bites on small
      screens, where a standard cell itself gets small */
  floorPx: PxBox | null;
  /** reflow text/spacing scale bounds, relative to the preset's base tokens */
  scale: { min: number; max: number };
  /** what useWidget().size / .orientation report for this preset, so widgets
      that still branch on S/M/L keep working during migration */
  legacy: { size: WidgetSize; orientation: Orientation };
};

/** smallest first — order matters for choosePreset's tie-breaking and for
    sorting a widget's declared presets */
export const SIZE_PRESETS: Record<PresetId, SizePreset> = {
  badge: {
    id: "badge",
    label: "badge",
    min: { cols: 1, rows: 1 },
    max: { cols: 2, rows: 1 },
    floorPx: { width: 140, height: 56 },
    scale: { min: 0.9, max: 1.25 },
    legacy: { size: "S", orientation: "h" },
  },
  strip: {
    id: "strip",
    label: "strip",
    min: { cols: 2, rows: 1 },
    max: { cols: 4, rows: 1 },
    floorPx: { width: 280, height: 56 },
    scale: { min: 0.9, max: 1.25 },
    legacy: { size: "S", orientation: "h" },
  },
  column: {
    id: "column",
    label: "column",
    min: { cols: 1, rows: 2 },
    max: { cols: 1, rows: 4 },
    floorPx: { width: 70, height: 120 },
    scale: { min: 0.9, max: 1.25 },
    legacy: { size: "S", orientation: "v" },
  },
  card: {
    id: "card",
    label: "card",
    min: { cols: 2, rows: 2 },
    max: { cols: 3, rows: 4 },
    floorPx: { width: 300, height: 130 },
    scale: { min: 0.9, max: 1.25 },
    legacy: { size: "M", orientation: "h" },
  },
  panel: {
    id: "panel",
    label: "panel",
    min: { cols: 2, rows: 4 },
    max: { cols: 3, rows: 8 },
    floorPx: { width: 300, height: 260 },
    scale: { min: 0.9, max: 1.25 },
    legacy: { size: "L", orientation: "h" },
  },
  hero: {
    id: "hero",
    label: "hero",
    min: null,
    max: null,
    floorPx: null,
    scale: { min: 0.9, max: 1.4 },
    legacy: { size: "L", orientation: "h" },
  },
};

export const PRESET_ORDER = Object.keys(SIZE_PRESETS) as PresetId[];

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === "string" && value in SIZE_PRESETS;
}

export function isFillMode(value: unknown): value is FillMode {
  return value === "reflow" || value === "scale";
}

/** dedupe + sort into catalog order, dropping unknown ids */
export function normalizePresets(ids: readonly unknown[]): PresetId[] {
  const wanted = new Set(ids.filter(isPresetId));
  return PRESET_ORDER.filter((id) => wanted.has(id));
}

/** S/M/L → presets, for widgets that don't declare presets yet:
    S → badge + column, M → card, L → panel + hero.
    - column even for h-only widgets: S widgets already sit in 1x2 cells on
      real canvases, and dropping column would make those placements invalid.
      The shell keeps such a widget on its own orientation.
    - hero for L keeps the old "a widget filling its region renders its
      largest layout" rule. */
export function presetsFromLegacy(sizes: readonly WidgetSize[]): PresetId[] {
  const out: PresetId[] = [];
  if (sizes.includes("S")) out.push("badge", "column");
  if (sizes.includes("M")) out.push("card");
  if (sizes.includes("L")) out.push("panel", "hero");
  return normalizePresets(out.length ? out : ["card"]);
}

/** the preset a legacy default size maps to */
export function presetFromLegacySize(size: WidgetSize, orientation: Orientation): PresetId {
  if (size === "S") return orientation === "v" ? "column" : "badge";
  return size === "M" ? "card" : "panel";
}

// Size presets in the widget creator's Plan brief (docs/design/WIDGET_SIZE_PRESETS.md
// §10). The planner asks which presets a widget ships in and what each one
// shows; the brief carries that as `presets` / `defaultPreset` / `fill` /
// `presetContent`. Ideate and Build still speak S/M/L, so every brief with
// presets also carries the derived legacy fields (sizes, s/m/lContent) —
// computed here, in one place, whenever a brief is parsed or edited.

import {
  PRESET_ORDER,
  SIZE_PRESETS,
  isFillMode,
  isPresetId,
  normalizePresets,
  type FillMode,
  type PresetId,
  type SCBox,
} from "@/config/sizePresets";
import { REFERENCE_FRAME, standardCell } from "@/lib/grid/standardCell";
import type { WidgetBrief } from "./projectStore";

/** what each preset is for — shown to the planner and in the brief editor */
export const PRESET_EXAMPLES: Record<PresetId, string> = {
  badge: "one glanceable thing: a stat, a status dot + label, a tiny control",
  strip: "a wide, short row: a ticker, a progress bar, a few stats side by side",
  column: "a tall, narrow stack: a vertical list, a gauge, a timeline",
  card: "the standard card: a headline value plus a few rows or a small chart",
  panel: "a detailed view: longer lists, history, charts with controls",
  hero: "fills a whole region; must be fully fluid or scale to fit",
};

const REF_CELL = standardCell(REFERENCE_FRAME);

function boxPx(box: SCBox): string {
  const w = Math.round(box.cols * REF_CELL.pitchX - REFERENCE_FRAME.gap);
  const h = Math.round(box.rows * REF_CELL.pitchY - REFERENCE_FRAME.gap);
  return `${w}×${h}px`;
}

/** "2x2 to 3x4 cells (≈481×236px to 728×484px at 1920×1080)" */
export function presetRange(id: PresetId): string {
  const { min, max } = SIZE_PRESETS[id];
  if (!min || !max) return "the whole region it sits in (any shape)";
  return `${min.cols}x${min.rows} to ${max.cols}x${max.rows} cells (≈${boxPx(min)} to ${boxPx(max)} at 1920×1080)`;
}

/** the catalog as prompt text, one line per preset */
export function presetCatalogText(): string {
  return PRESET_ORDER.map((id) => `- **${id}**: ${presetRange(id)}. ${PRESET_EXAMPLES[id]}.`).join("\n");
}

/** legacy S/M/L view of a preset set. Presets sharing a legacy size (badge,
    strip and column are all S) are labelled inside that size's content, so
    the builder can still tell them apart via useWidget().preset. */
function legacyFromPresets(presets: PresetId[], content: Partial<Record<PresetId, string>>) {
  const bySize = { S: [] as PresetId[], M: [] as PresetId[], L: [] as PresetId[] };
  for (const id of presets) bySize[SIZE_PRESETS[id].legacy.size].push(id);
  const describe = (ids: PresetId[]) => {
    const parts = ids.map((id) => (content[id] ? `[${id}] ${content[id]}` : "")).filter(Boolean);
    return parts.length ? parts.join(" ") : undefined;
  };
  return {
    sizes: (["S", "M", "L"] as const).filter((s) => bySize[s].length > 0) as string[],
    sContent: describe(bySize.S),
    mContent: describe(bySize.M),
    lContent: describe(bySize.L),
  };
}

function pickDefault(presets: PresetId[], wanted: unknown): PresetId {
  if (isPresetId(wanted) && presets.includes(wanted)) return wanted;
  if (presets.includes("card")) return "card";
  return presets.find((id) => id !== "hero") ?? presets[0];
}

/** Validate a brief's preset fields and refresh its derived S/M/L fields.
    A brief without presets (an old one, or a planner that ignored the
    format) is returned with its legacy fields untouched. */
export function withPresetFields(brief: WidgetBrief): WidgetBrief {
  const presets = normalizePresets(Array.isArray(brief.presets) ? brief.presets : []);
  if (!presets.length) {
    const legacy = { ...brief };
    delete legacy.presets;
    delete legacy.defaultPreset;
    delete legacy.fill;
    delete legacy.presetContent;
    return legacy;
  }
  const raw = brief.presetContent && typeof brief.presetContent === "object" ? brief.presetContent : {};
  const presetContent: Partial<Record<PresetId, string>> = {};
  for (const id of presets) {
    const text = (raw as Record<string, unknown>)[id];
    if (typeof text === "string" && text.trim()) presetContent[id] = text.trim();
  }
  return {
    ...brief,
    presets,
    defaultPreset: pickDefault(presets, brief.defaultPreset),
    fill: isFillMode(brief.fill) ? brief.fill : "reflow",
    presetContent,
    ...legacyFromPresets(presets, presetContent),
  };
}

/** parse the planner's widget-brief JSON; null when it isn't a brief */
export function parseBrief(json: string): WidgetBrief | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return withPresetFields(raw as WidgetBrief);
}

/** presets for a brief written before presets existed: one per legacy size
    (S → badge, M → card, L → panel), carrying that size's content */
export function presetsFromLegacyBrief(brief: WidgetBrief): {
  presets: PresetId[];
  presetContent: Partial<Record<PresetId, string>>;
} {
  const sizes = brief.sizes?.length ? brief.sizes : ["M"];
  const map = [
    ["S", "badge", brief.sContent],
    ["M", "card", brief.mContent],
    ["L", "panel", brief.lContent],
  ] as const;
  const presets: PresetId[] = [];
  const presetContent: Partial<Record<PresetId, string>> = {};
  for (const [size, id, content] of map) {
    if (!sizes.includes(size)) continue;
    presets.push(id);
    if (content) presetContent[id] = content;
  }
  return { presets, presetContent };
}

/** orientations a preset set needs in Graph Layout: column is a vertical S */
export function orientationsForPresets(presets: PresetId[]): string[] {
  return presets.includes("column") ? ["h", "v"] : ["h"];
}

/** a preset's range in cells, e.g. "2x2–3x4"; null for hero (the whole region) */
export function presetCells(id: PresetId): string | null {
  const { min, max } = SIZE_PRESETS[id];
  if (!min || !max) return null;
  const a = `${min.cols}x${min.rows}`;
  const b = `${max.cols}x${max.rows}`;
  return a === b ? a : `${a}–${b}`;
}

/** What choosing presets directly in Build sets: the presets themselves plus
    the legacy sizes/orientations the registry and Graph Layout still read —
    the same fields a Plan brief carries (withPresetFields). An empty pick
    clears them all, leaving the plain S/M/L defaults. */
export function presetSettingsPatch(picked: PresetId[], defaultPreset?: unknown, fill?: unknown) {
  const presets = normalizePresets(picked);
  if (!presets.length) {
    return {
      presets: undefined,
      defaultPreset: undefined,
      fill: undefined,
      presetContent: undefined,
      sizes: ["S", "M", "L"],
      orientations: ["h"],
    };
  }
  return {
    presets,
    defaultPreset: pickDefault(presets, defaultPreset),
    fill: isFillMode(fill) ? fill : ("reflow" as FillMode),
    sizes: legacyFromPresets(presets, {}).sizes,
    orientations: orientationsForPresets(presets),
  };
}

export type { FillMode, PresetId };

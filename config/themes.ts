// Theme pack metadata — picker labels and swatches only. The actual tokens
// are plain CSS blocks in styles/globals.css keyed by [data-palette="…"]
// (no attribute = ember, the original warm palette). Every pack defines the
// full token set for both dark and light modes.

export type PaletteId = "ember" | "slate" | "moss" | "plum" | "reef" | "raspberry" | "circuit" | "graphite" | "wallpaper";

/** the generated "auto" pack — tokens derived from the canvas wallpaper at
    runtime by lib/wallpaperPalette.ts, so it has no CSS block in globals.css
    and isn't listed in THEME_PACKS. Only selectable while the canvas has a
    wallpaper; without one it falls back to ember's tokens. */
export const WALLPAPER_PALETTE = "wallpaper" as const;

export type ThemePack = {
  id: PaletteId;
  label: string;
  /** [card bg, primary accent, secondary accent] — drawn in the picker */
  swatch: [string, string, string];
};

export const DEFAULT_PALETTE: PaletteId = "ember";

export const THEME_PACKS: (ThemePack & { id: Exclude<PaletteId, typeof WALLPAPER_PALETTE> })[] = [
  { id: "ember", label: "ember", swatch: ["#1e1a14", "#ff6b2b", "#00b4c8"] },
  { id: "slate", label: "slate", swatch: ["#161b22", "#4da3ff", "#00c8a0"] },
  { id: "moss", label: "moss", swatch: ["#141c14", "#8fc63c", "#d89a28"] },
  { id: "plum", label: "plum", swatch: ["#1c141e", "#e84a8a", "#d8a830"] },
  { id: "reef", label: "reef", swatch: ["#102321", "#ff7a59", "#5ad7b7"] },
  { id: "raspberry", label: "berry", swatch: ["#21151a", "#ff4d6d", "#39c6d6"] },
  { id: "circuit", label: "circuit", swatch: ["#151b19", "#f2c94c", "#2dd4bf"] },
  { id: "graphite", label: "graphite", swatch: ["#1b1b1b", "#f0623d", "#b4d455"] },
];

export function isPaletteId(value: unknown): value is PaletteId {
  return value === WALLPAPER_PALETTE || THEME_PACKS.some((p) => p.id === value);
}

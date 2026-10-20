// A canvas's own accent colour, independent of whichever canvas is active.
//
// Theme mode and palette are per-canvas (lib/theme.ts, canvasScopedKey), but
// the resolved CSS tokens (--accent-orange etc.) only ever describe the
// *active* canvas — they're written to :root. CanvasSwitcher's pills need a
// preview of every OTHER canvas's colour too, for the hover highlight (see
// its CSS comment), so this reads each canvas's own stored palette choice
// and resolves an accent hex directly, never touching :root.
//
// The swatches this draws from (config/themes.ts's THEME_PACKS, and the
// generated wallpaper pack's cached tokens) are themselves mode-agnostic —
// one hex standing in for "this palette", the same one the palette picker
// itself shows — so this doesn't need that canvas's theme mode at all.

import { getPalette } from "@/lib/theme";
import { THEME_PACKS, WALLPAPER_PALETTE, DEFAULT_PALETTE } from "@/config/themes";
import { ensureWallpaperPalette, getWallpaperPaletteSwatch, subscribeWallpaperPalette } from "@/lib/wallpaperPalette";
import { subscribeTheme } from "@/lib/theme";

const FALLBACK_ACCENT = THEME_PACKS.find((pack) => pack.id === DEFAULT_PALETTE)!.swatch[1];

/** `canvasId`'s own accent colour, resolved from its own palette choice.
    For the generated "auto" pack this needs the wallpaper actually sampled;
    if it hasn't been yet, this kicks off that sampling (cache-only, see
    ensureWallpaperPalette's doc comment) and returns the ember accent as a
    placeholder until subscribeCanvasAccent's next notification. */
export function getCanvasAccentColor(canvasId: string): string {
  const palette = getPalette(canvasId);
  if (palette === WALLPAPER_PALETTE) {
    const swatch = getWallpaperPaletteSwatch(canvasId);
    if (swatch) return swatch[1];
    ensureWallpaperPalette(canvasId);
    return FALLBACK_ACCENT;
  }
  return THEME_PACKS.find((pack) => pack.id === palette)?.swatch[1] ?? FALLBACK_ACCENT;
}

/** SSR-safe fallback for useSyncExternalStore's getServerSnapshot — the real
    value depends on localStorage, which doesn't exist on the server. */
export function getServerCanvasAccentColor(): string {
  return FALLBACK_ACCENT;
}

/** fires whenever any canvas's resolved accent could have changed: a
    wallpaper finished sampling, or a palette was switched (setPalette only
    ever touches the active canvas, but that's exactly the canvas whose pill
    needs to pick up the new colour). */
export function subscribeCanvasAccent(listener: () => void) {
  const unsubTheme = subscribeTheme(listener);
  const unsubWallpaper = subscribeWallpaperPalette(listener);
  return () => {
    unsubTheme();
    unsubWallpaper();
  };
}

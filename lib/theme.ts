// Shared theme store — light / dark / auto mode (auto follows time of day)
// plus the color palette pack. Backed by the same "nutmag-theme" /
// "nutmag-palette" localStorage keys the pre-paint script in app/layout.tsx
// reads, so there's no flash on load. Client-side only.

import { DEFAULT_PALETTE, isPaletteId, type PaletteId } from "@/config/themes";

export type ThemeMode = "light" | "dark" | "auto";

const STORAGE_KEY = "nutmag-theme";
const PALETTE_KEY = "nutmag-palette";
const listeners = new Set<() => void>();

export function getThemeMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "auto" ? stored : "dark";
}

export function getServerThemeMode(): ThemeMode {
  return "dark";
}

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode !== "auto") return mode;
  const hour = new Date().getHours();
  return hour >= 20 || hour < 6 ? "dark" : "light";
}

/** Apply the resolved theme to <html data-theme>. Cheap to call repeatedly —
 *  only touches the DOM when the resolved theme actually changes (auto mode
 *  flips at 06:00 / 20:00, so callers can re-run this on a timer). */
export function applyTheme() {
  const light = resolve(getThemeMode()) === "light";
  const isLight = document.documentElement.dataset.theme === "light";
  if (light && !isLight) {
    document.documentElement.dataset.theme = "light";
  } else if (!light && isLight) {
    delete document.documentElement.dataset.theme;
  }
}

export function applyPalette() {
  const id = getPalette();
  if (id === DEFAULT_PALETTE) {
    delete document.documentElement.dataset.palette;
  } else {
    document.documentElement.dataset.palette = id;
  }
}

export function applyThemeSettings() {
  applyTheme();
  applyPalette();
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode);
  applyTheme();
  listeners.forEach((listener) => listener());
}

export function getPalette(): PaletteId {
  const stored = localStorage.getItem(PALETTE_KEY);
  return isPaletteId(stored) ? stored : DEFAULT_PALETTE;
}

export function getServerPalette(): PaletteId {
  return DEFAULT_PALETTE;
}

export function setPalette(id: PaletteId) {
  localStorage.setItem(PALETTE_KEY, id);
  applyPalette();
  listeners.forEach((listener) => listener());
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

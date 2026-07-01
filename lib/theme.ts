// Shared theme store — light / dark / auto mode (auto follows time of day)
// plus the color palette pack. Backed by the same "nutmag-theme" /
// "nutmag-palette" localStorage keys the pre-paint script in app/layout.tsx
// reads, so there's no flash on load. Client-side only.
//
// Per-canvas (lib/canvases.ts): each canvas can have its own theme mode and
// palette, namespaced via canvasScopedKey() exactly like lib/slotLayout.ts's
// widget arrangement — the DEFAULT_CANVAS_ID canvas keeps the bare keys (no
// migration for existing users), every other canvas gets `::<id>` suffixed
// keys. Unlike slotLayout.ts there's no module-level cache to invalidate on
// canvas switch (every getter reads localStorage fresh each call) — the only
// thing a canvas switch needs to do is re-apply the DOM (data-theme/palette
// attributes) and notify this store's own listeners, both handled by the
// subscribeCanvases() callback below.

import { DEFAULT_PALETTE, isPaletteId, type PaletteId } from "@/config/themes";
import { canvasScopedKey, getActiveCanvasId, subscribeCanvases } from "@/lib/canvases";
import { pollWhileVisible, pullFromServer, pushToServer } from "@/lib/serverSync";

export type ThemeMode = "light" | "dark" | "auto";

const STORAGE_KEY = "nutmag-theme";
const PALETTE_KEY = "nutmag-palette";
const listeners = new Set<() => void>();

function themeKey(): string {
  return canvasScopedKey(STORAGE_KEY, getActiveCanvasId());
}

function paletteKey(): string {
  return canvasScopedKey(PALETTE_KEY, getActiveCanvasId());
}

export function getThemeMode(): ThemeMode {
  const stored = localStorage.getItem(themeKey());
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
  localStorage.setItem(themeKey(), mode);
  pushToServer(themeKey(), mode);
  applyTheme();
  listeners.forEach((listener) => listener());
}

export function getPalette(): PaletteId {
  const stored = localStorage.getItem(paletteKey());
  return isPaletteId(stored) ? stored : DEFAULT_PALETTE;
}

export function getServerPalette(): PaletteId {
  return DEFAULT_PALETTE;
}

export function setPalette(id: PaletteId) {
  localStorage.setItem(paletteKey(), id);
  pushToServer(paletteKey(), id);
  applyPalette();
  listeners.forEach((listener) => listener());
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// re-skin the page whenever the active canvas changes — each canvas's theme
// mode/palette is independent (see themeKey/paletteKey above), so switching
// canvases must re-read localStorage under the new canvas's keys and notify
// this store's own listeners so subscribed UI (theme toggle, AppearanceSettings)
// re-renders with the new canvas's values
let lastCanvasId: string | null = null;
subscribeCanvases(() => {
  const id = getActiveCanvasId();
  if (lastCanvasId !== null && id === lastCanvasId) return;
  lastCanvasId = id;
  applyThemeSettings();
  listeners.forEach((listener) => listener());
  syncWithServer();
});

// Reconcile the active canvas's theme mode + palette with the server: on
// load, on canvas switch (above), and every 15s thereafter (skipped while
// the tab is hidden). A fresh install has nothing on the server yet, in
// which case we seed it with whatever's local.
async function syncWithServer() {
  const [remoteMode, remotePalette] = await Promise.all([
    pullFromServer<ThemeMode>(themeKey()),
    pullFromServer<PaletteId>(paletteKey()),
  ]);

  let changed = false;
  if (remoteMode === undefined) {
    pushToServer(themeKey(), getThemeMode());
  } else if ((remoteMode === "light" || remoteMode === "dark" || remoteMode === "auto") && remoteMode !== getThemeMode()) {
    localStorage.setItem(themeKey(), remoteMode);
    changed = true;
  }

  if (remotePalette === undefined) {
    pushToServer(paletteKey(), getPalette());
  } else if (isPaletteId(remotePalette) && remotePalette !== getPalette()) {
    localStorage.setItem(paletteKey(), remotePalette);
    changed = true;
  }

  if (!changed) return;
  applyThemeSettings();
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  syncWithServer();
  pollWhileVisible(syncWithServer);
}

// Wallpaper image + backdrop mode store. Mirrors lib/theme.ts's external-store
// pattern (module cache, listener set, subscribeCanvases() re-sync on canvas
// switch) — split into its own module because the image half is backed by
// IndexedDB (lib/idb.ts), which is async-only, unlike theme's synchronous
// localStorage reads.
//
// Three independent stacked layers, each per-canvas:
//   BG (the wallpaper image itself — no mode of its own)
//   -> canvas (.frame, the bezel holding the grid — getBackdropMode/setBackdropMode)
//   -> widgets (.block — getWidgetBackdropMode/setWidgetBackdropMode is the
//      *default* every "auto" widget inherits; each widget can still override
//      independently via its own gear popover's cardBackdrop setting)
// Canvas and widget defaults are deliberately independent dials, not one
// cascading from the other — small strings, so both stay in localStorage like
// theme mode/palette, namespaced the same way.

import { canvasScopedKey, getActiveCanvasId, subscribeCanvases } from "@/lib/canvases";
import { idbDelete, idbGet, idbSet } from "@/lib/idb";

export type BackdropMode = "solid" | "blur" | "transparent";

const CANVAS_MODE_KEY = "nutmag-backdrop";
const WIDGET_MODE_KEY = "nutmag-widget-backdrop";
const listeners = new Set<() => void>();

/** canvasId -> resolved object URL, or null once confirmed empty */
const urlCache = new Map<string, string | null>();
/** canvasId -> in-flight load, so concurrent getters don't double-fetch */
const loading = new Map<string, Promise<void>>();

function wallpaperKey(canvasId: string): string {
  return `wallpaper:${canvasId}`;
}

function canvasModeKey(canvasId: string): string {
  return canvasScopedKey(CANVAS_MODE_KEY, canvasId);
}

function widgetModeKey(canvasId: string): string {
  return canvasScopedKey(WIDGET_MODE_KEY, canvasId);
}

async function load(canvasId: string): Promise<void> {
  if (loading.has(canvasId)) return loading.get(canvasId);
  const promise = (async () => {
    const blob = await idbGet(wallpaperKey(canvasId));
    urlCache.set(canvasId, blob ? URL.createObjectURL(blob) : null);
    loading.delete(canvasId);
    listeners.forEach((listener) => listener());
  })();
  loading.set(canvasId, promise);
  return promise;
}

/** synchronous for useSyncExternalStore — returns the cached object URL (or
    null), kicking off a background IndexedDB read on first call for a canvas
    that hasn't been loaded yet */
export function getWallpaperUrl(canvasId: string = getActiveCanvasId()): string | null {
  if (!urlCache.has(canvasId) && !loading.has(canvasId)) void load(canvasId);
  return urlCache.get(canvasId) ?? null;
}

export function getServerWallpaperUrl(): null {
  return null;
}

export async function setWallpaper(canvasId: string, file: File): Promise<void> {
  await idbSet(wallpaperKey(canvasId), file);
  const previous = urlCache.get(canvasId);
  if (previous) URL.revokeObjectURL(previous);
  urlCache.set(canvasId, URL.createObjectURL(file));
  listeners.forEach((listener) => listener());
}

export async function clearWallpaper(canvasId: string): Promise<void> {
  await idbDelete(wallpaperKey(canvasId));
  const previous = urlCache.get(canvasId);
  if (previous) URL.revokeObjectURL(previous);
  urlCache.set(canvasId, null);
  listeners.forEach((listener) => listener());
}

function readMode(key: string): BackdropMode {
  const stored = localStorage.getItem(key);
  return stored === "blur" || stored === "transparent" ? stored : "solid";
}

function applyMode(attr: "backdrop" | "widgetBackdrop", mode: BackdropMode) {
  const current = document.documentElement.dataset[attr];
  if (mode === "solid") {
    if (current !== undefined) delete document.documentElement.dataset[attr];
  } else if (current !== mode) {
    document.documentElement.dataset[attr] = mode;
  }
}

export function getBackdropMode(canvasId: string = getActiveCanvasId()): BackdropMode {
  return readMode(canvasModeKey(canvasId));
}

export function getServerBackdropMode(): BackdropMode {
  return "solid";
}

export function setBackdropMode(canvasId: string, mode: BackdropMode) {
  localStorage.setItem(canvasModeKey(canvasId), mode);
  applyBackdropModes();
  listeners.forEach((listener) => listener());
}

export function getWidgetBackdropMode(canvasId: string = getActiveCanvasId()): BackdropMode {
  return readMode(widgetModeKey(canvasId));
}

export function getServerWidgetBackdropMode(): BackdropMode {
  return "solid";
}

export function setWidgetBackdropMode(canvasId: string, mode: BackdropMode) {
  localStorage.setItem(widgetModeKey(canvasId), mode);
  applyBackdropModes();
  listeners.forEach((listener) => listener());
}

/** apply the active canvas's backdrop modes to <html data-backdrop> /
    data-widget-backdrop> — cheap to call repeatedly, only touches the DOM
    when a value actually changes */
export function applyBackdropModes() {
  applyMode("backdrop", getBackdropMode());
  applyMode("widgetBackdrop", getWidgetBackdropMode());
}

export function subscribeWallpaper(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// re-skin on canvas switch — same pattern as lib/theme.ts's subscribeCanvases
// block: re-apply backdrop modes and notify listeners so WallpaperLayer and the
// settings panel re-render with the new canvas's wallpaper/modes
let lastCanvasId: string | null = null;
subscribeCanvases(() => {
  const id = getActiveCanvasId();
  if (lastCanvasId !== null && id === lastCanvasId) return;
  lastCanvasId = id;
  applyBackdropModes();
  listeners.forEach((listener) => listener());
});

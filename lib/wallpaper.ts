// Wallpaper image + backdrop mode store. Mirrors lib/theme.ts's external-store
// pattern (module cache, listener set, subscribeCanvases() re-sync on canvas
// switch).
//
// The wallpaper image/video itself is stored server-side (app/api/hub-files,
// bytes on disk + a FileBlob row for its mimeType) — the server is the source
// of truth, not a local cache; getWallpaperUrl() just returns an API URL, and
// <img>/<video> load it directly. The only thing kept client-side is small
// metadata (kind + a version stamp used to cache-bust the URL after a
// replace), synced through the same KV store as everything else in lib/.
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
//
// Parallax is a separate opt-in toggle that nudges the wallpaper layer with
// the mouse — purely cosmetic, lives next to the wallpaper picker in Hub
// Core's Appearance settings.

import { canvasScopedKey, getActiveCanvasId, subscribeCanvases } from "@/lib/canvases";
import { deleteFromServer, pollWhileVisible, pullFromServer, pushToServer } from "@/lib/serverSync";

export type BackdropMode = "solid" | "blur" | "transparent" | "glass";
export type WallpaperKind = "image" | "video";

const CANVAS_MODE_KEY = "nutmag-backdrop";
const WIDGET_MODE_KEY = "nutmag-widget-backdrop";
const PARALLAX_KEY = "nutmag-parallax";
const WALLPAPER_META_KEY = "nutmag-wallpaper-meta";
const listeners = new Set<() => void>();

type WallpaperMeta = { kind: WallpaperKind; version: number };

/** canvasId -> cached metadata, or null once confirmed empty; unset = not read from localStorage yet */
const metaCache = new Map<string, WallpaperMeta | null>();
/** canvasIds whose metadata has been reconciled with the server at least once
    this session — see syncWallpaperMeta() for why this matters */
const metaEverSynced = new Set<string>();

function wallpaperFileKey(canvasId: string): string {
  return `wallpaper:${canvasId}`;
}

function wallpaperMetaKey(canvasId: string): string {
  return canvasScopedKey(WALLPAPER_META_KEY, canvasId);
}

function canvasModeKey(canvasId: string): string {
  return canvasScopedKey(CANVAS_MODE_KEY, canvasId);
}

function widgetModeKey(canvasId: string): string {
  return canvasScopedKey(WIDGET_MODE_KEY, canvasId);
}

function parallaxKey(canvasId: string): string {
  return canvasScopedKey(PARALLAX_KEY, canvasId);
}

function kindOf(blob: Blob): WallpaperKind {
  return blob.type.startsWith("video/") ? "video" : "image";
}

function isWallpaperMeta(v: unknown): v is WallpaperMeta {
  if (!v || typeof v !== "object") return false;
  const { kind, version } = v as Record<string, unknown>;
  return (kind === "image" || kind === "video") && typeof version === "number";
}

function readMeta(canvasId: string): WallpaperMeta | null {
  if (!metaCache.has(canvasId)) {
    let meta: WallpaperMeta | null = null;
    try {
      const raw = localStorage.getItem(wallpaperMetaKey(canvasId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isWallpaperMeta(parsed)) meta = parsed;
      }
    } catch {
      // corrupt saved metadata — treat as no wallpaper
    }
    metaCache.set(canvasId, meta);
  }
  return metaCache.get(canvasId) ?? null;
}

function writeMeta(canvasId: string, meta: WallpaperMeta | null) {
  metaCache.set(canvasId, meta);
  try {
    if (meta) localStorage.setItem(wallpaperMetaKey(canvasId), JSON.stringify(meta));
    else localStorage.removeItem(wallpaperMetaKey(canvasId));
  } catch {
    // storage full/blocked — metadata still applies for this session
  }
}

/** synchronous for useSyncExternalStore — an API URL pointing straight at the
    server-stored file (the server is the source of truth, no local blob
    cache), or null if this canvas has no wallpaper. `v` cache-busts the URL
    after a replace so the browser doesn't serve the old file from cache. */
export function getWallpaperUrl(canvasId: string = getActiveCanvasId()): string | null {
  const meta = readMeta(canvasId);
  if (!meta) return null;
  return `/api/hub-files?key=${encodeURIComponent(wallpaperFileKey(canvasId))}&v=${meta.version}`;
}

export function getServerWallpaperUrl(): null {
  return null;
}

/** "image" | "video" | null (no wallpaper set) — drives whether
    WallpaperLayer renders a <video> or a background-image div */
export function getWallpaperKind(canvasId: string = getActiveCanvasId()): WallpaperKind | null {
  return readMeta(canvasId)?.kind ?? null;
}

export function getServerWallpaperKind(): null {
  return null;
}

export async function setWallpaper(canvasId: string, file: File): Promise<void> {
  await fetch(`/api/hub-files?key=${encodeURIComponent(wallpaperFileKey(canvasId))}`, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const meta: WallpaperMeta = { kind: kindOf(file), version: Date.now() };
  writeMeta(canvasId, meta);
  pushToServer(wallpaperMetaKey(canvasId), meta);
  metaEverSynced.add(canvasId);
  listeners.forEach((listener) => listener());
}

export async function clearWallpaper(canvasId: string): Promise<void> {
  await fetch(`/api/hub-files?key=${encodeURIComponent(wallpaperFileKey(canvasId))}`, { method: "DELETE" });
  writeMeta(canvasId, null);
  deleteFromServer(wallpaperMetaKey(canvasId));
  metaEverSynced.add(canvasId);
  listeners.forEach((listener) => listener());
}

/** opt-in mouse-follow parallax on the wallpaper layer — off by default */
export function getParallax(canvasId: string = getActiveCanvasId()): boolean {
  return localStorage.getItem(parallaxKey(canvasId)) === "1";
}

export function getServerParallax(): boolean {
  return false;
}

export function setParallax(canvasId: string, enabled: boolean) {
  localStorage.setItem(parallaxKey(canvasId), enabled ? "1" : "0");
  pushToServer(parallaxKey(canvasId), enabled);
  listeners.forEach((listener) => listener());
}

function readMode(key: string): BackdropMode {
  const stored = localStorage.getItem(key);
  return stored === "blur" || stored === "transparent" || stored === "glass" ? stored : "solid";
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
  pushToServer(canvasModeKey(canvasId), mode);
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
  pushToServer(widgetModeKey(canvasId), mode);
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
  syncModesWithServer();
  syncWallpaperMeta();
});

// Reconcile the active canvas's backdrop modes + parallax flag with the
// server: on load, on canvas switch (above), and every 15s thereafter
// (skipped while the tab is hidden).
async function syncModesWithServer() {
  const canvasId = getActiveCanvasId();
  const [remoteMode, remoteWidgetMode, remoteParallax] = await Promise.all([
    pullFromServer<BackdropMode>(canvasModeKey(canvasId)),
    pullFromServer<BackdropMode>(widgetModeKey(canvasId)),
    pullFromServer<boolean>(parallaxKey(canvasId)),
  ]);

  const isMode = (v: unknown): v is BackdropMode => v === "solid" || v === "blur" || v === "transparent" || v === "glass";
  let changed = false;

  if (remoteMode === undefined) {
    pushToServer(canvasModeKey(canvasId), getBackdropMode(canvasId));
  } else if (isMode(remoteMode) && remoteMode !== getBackdropMode(canvasId)) {
    localStorage.setItem(canvasModeKey(canvasId), remoteMode);
    changed = true;
  }

  if (remoteWidgetMode === undefined) {
    pushToServer(widgetModeKey(canvasId), getWidgetBackdropMode(canvasId));
  } else if (isMode(remoteWidgetMode) && remoteWidgetMode !== getWidgetBackdropMode(canvasId)) {
    localStorage.setItem(widgetModeKey(canvasId), remoteWidgetMode);
    changed = true;
  }

  if (remoteParallax === undefined) {
    pushToServer(parallaxKey(canvasId), getParallax(canvasId));
  } else if (typeof remoteParallax === "boolean" && remoteParallax !== getParallax(canvasId)) {
    localStorage.setItem(parallaxKey(canvasId), remoteParallax ? "1" : "0");
    changed = true;
  }

  if (!changed) return;
  applyBackdropModes();
  listeners.forEach((listener) => listener());
}

/** Reconcile the active canvas's wallpaper metadata with the server: on
    load, on canvas switch (above), and every 15s thereafter. Unlike the
    other stores, "no wallpaper" is a real, common, intentional state (the
    user cleared it) rather than "never set" — so a missing server value only
    gets treated as "seed the server" on this canvas's *first* sync this
    session (covers a metadata push that failed right after a successful
    file upload); every sync after that treats a missing server value as an
    intentional deletion made from another device and adopts it locally. */
async function syncWallpaperMeta() {
  const canvasId = getActiveCanvasId();
  const key = wallpaperMetaKey(canvasId);
  const remote = await pullFromServer<WallpaperMeta>(key);
  const local = readMeta(canvasId);

  if (remote === undefined) {
    if (!metaEverSynced.has(canvasId) && local) {
      pushToServer(key, local);
    } else if (local) {
      writeMeta(canvasId, null);
      listeners.forEach((listener) => listener());
    }
    metaEverSynced.add(canvasId);
    return;
  }

  metaEverSynced.add(canvasId);
  if (local && local.version === remote.version) return;
  writeMeta(canvasId, remote);
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  syncModesWithServer();
  syncWallpaperMeta();
  pollWhileVisible(() => {
    syncModesWithServer();
    syncWallpaperMeta();
  });
}

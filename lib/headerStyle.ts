// Global default for how every widget renders its own name + icon.
//
// Mirrors lib/theme.ts's external-store pattern exactly (module-free getters
// that read localStorage fresh, a listener set, canvas-scoped keys, server
// reconciliation, subscribeCanvases() re-sync on canvas switch).
//
// This is the same two-tier dial the widget backdrop uses (lib/wallpaper.ts's
// getWidgetBackdropMode): the value here is the *default* every widget on the
// canvas inherits, and each widget can still override it independently through
// its own gear popover's `headerStyle` setting — "auto" means "follow this".
// Per-canvas, like theme/palette/backdrop, so a dense homelab canvas can run
// headerless while a showcase canvas runs crests.
//
// Unlike the backdrop dial this can't be a pure CSS cascade: the header style
// picks which markup WidgetShell renders, not just how it's painted. So there
// is no <html> attribute and no pre-paint script entry — WidgetShell subscribes
// and re-renders. The cost is that server-rendered widgets show the "stamp"
// server snapshot until hydration reads localStorage; the widget arrangement
// itself already resolves client-side the same way, so this doesn't add a
// visible swap that wasn't there.

import { canvasScopedKey, getActiveCanvasId, subscribeCanvases } from "@/lib/canvases";
import { pollWhileVisible, pullFromServer, pushToServer } from "@/lib/serverSync";
import { DEFAULT_HEADER_STYLE, isHeaderStyle, type HeaderStyle } from "@/config/widgets";

const STORAGE_KEY = "nutmag-widget-header";
const listeners = new Set<() => void>();

function headerKey(canvasId: string = getActiveCanvasId()): string {
  return canvasScopedKey(STORAGE_KEY, canvasId);
}

export function getHeaderStyle(canvasId: string = getActiveCanvasId()): HeaderStyle {
  const stored = localStorage.getItem(headerKey(canvasId));
  return isHeaderStyle(stored) ? stored : DEFAULT_HEADER_STYLE;
}

export function getServerHeaderStyle(): HeaderStyle {
  return DEFAULT_HEADER_STYLE;
}

export function setHeaderStyle(canvasId: string, style: HeaderStyle) {
  localStorage.setItem(headerKey(canvasId), style);
  pushToServer(headerKey(canvasId), style);
  listeners.forEach((listener) => listener());
}

export function subscribeHeaderStyle(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// each canvas keeps its own default — switching canvases must re-read under the
// new canvas's key and notify subscribers (every WidgetShell, plus the Hub Core
// row) so they re-render with that canvas's value
let lastCanvasId: string | null = null;
subscribeCanvases(() => {
  const id = getActiveCanvasId();
  if (lastCanvasId !== null && id === lastCanvasId) return;
  lastCanvasId = id;
  listeners.forEach((listener) => listener());
  syncWithServer();
});

// Reconcile the active canvas's default with the server: on load, on canvas
// switch (above), and every 15s thereafter (skipped while the tab is hidden).
// Nothing on the server yet means a fresh install — seed it with the local one.
async function syncWithServer() {
  const key = headerKey();
  const remote = await pullFromServer<HeaderStyle>(key);
  if (remote === undefined) {
    pushToServer(key, getHeaderStyle());
    return;
  }
  if (!isHeaderStyle(remote) || remote === getHeaderStyle()) return;
  localStorage.setItem(key, remote);
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  syncWithServer();
  pollWhileVisible(syncWithServer);
}

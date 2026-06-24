// Canvases store — Arc-spaces-style named layouts. Mirrors the lib/theme.ts /
// lib/prefs.ts external-store pattern: module-level cache, listener set,
// persist-on-commit to localStorage["nutmag-canvases"]. Each canvas only
// tracks identity (id/name/icon) here; the widget arrangement and theme/
// palette live in lib/slotLayout.ts / lib/theme.ts, each namespaced per
// canvas via canvasScopedKey() so neither of those modules needs to know
// canvases exist beyond reacting to subscribeCanvases().

import { isCanvasIconName } from "@/config/canvasIcons";

export type Canvas = { id: string; name: string; icon?: string };

export type CanvasesState = {
  canvases: Canvas[];
  activeId: string;
};

const STORAGE_KEY = "nutmag-canvases";
/** the original, unnamespaced slot-layout localStorage key belongs to this
    canvas id — existing users keep their current arrangement with no migration */
export const DEFAULT_CANVAS_ID = "default";

const listeners = new Set<() => void>();
let state: CanvasesState | null = null;
let defaultState: CanvasesState | null = null;

/* cached singleton — getServerCanvases() must return a stable reference
   across renders, or useSyncExternalStore's getServerSnapshot triggers
   React's "should be cached to avoid an infinite loop" warning */
function buildDefaultState(): CanvasesState {
  if (!defaultState) {
    defaultState = { canvases: [{ id: DEFAULT_CANVAS_ID, name: "Home" }], activeId: DEFAULT_CANVAS_ID };
  }
  return defaultState;
}

/** namespace any base localStorage key by canvas — the DEFAULT_CANVAS_ID
    canvas keeps the bare key (existing users keep their current data with
    no migration); every other canvas gets a `::<id>` suffixed key. Used by
    lib/slotLayout.ts (slotLayoutKey) and lib/theme.ts so each canvas can
    have its own layout, theme mode, and palette. */
export function canvasScopedKey(baseKey: string, canvasId: string): string {
  return canvasId === DEFAULT_CANVAS_ID ? baseKey : `${baseKey}::${canvasId}`;
}

/** the lib/slotLayout.ts storage key for a given canvas — kept here so
    deleteCanvas() can clean up after itself without importing slotLayout.ts */
export function slotLayoutKey(canvasId: string): string {
  return canvasScopedKey("nutmag-slot-layout", canvasId);
}

function sanitize(raw: unknown): CanvasesState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const stored = raw as Record<string, unknown>;
  if (!Array.isArray(stored.canvases)) return null;

  const seen = new Set<string>();
  const canvases: Canvas[] = [];
  for (const item of stored.canvases) {
    if (!item || typeof item !== "object") continue;
    const { id, name, icon } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof name !== "string" || !name.trim() || seen.has(id)) continue;
    seen.add(id);
    canvases.push(isCanvasIconName(icon) ? { id, name, icon } : { id, name });
  }
  if (canvases.length === 0) return null;

  const activeId = typeof stored.activeId === "string" && seen.has(stored.activeId) ? stored.activeId : canvases[0].id;
  return { canvases, activeId };
}

export function getCanvases(): CanvasesState {
  if (state === null) {
    state = buildDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cleaned = sanitize(JSON.parse(raw));
        if (cleaned) state = cleaned;
      }
    } catch {
      // corrupt saved state — keep the default
    }
  }
  return state;
}

export function getServerCanvases(): CanvasesState {
  return buildDefaultState();
}

export function getActiveCanvasId(): string {
  return getCanvases().activeId;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full/blocked — state still applies for this session
  }
}

function commit(next: CanvasesState) {
  state = next;
  persist();
  listeners.forEach((listener) => listener());
}

export function subscribeCanvases(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function generateId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** create a new (empty) canvas and switch to it; the caller is responsible
    for what "empty" means — lib/slotLayout.ts treats any id other than
    DEFAULT_CANVAS_ID as starting with no widgets placed */
export function createCanvas(name: string): string {
  const current = getCanvases();
  const id = generateId();
  const trimmed = name.trim() || "untitled";
  commit({ canvases: [...current.canvases, { id, name: trimmed }], activeId: id });
  return id;
}

export function switchCanvas(id: string) {
  const current = getCanvases();
  if (current.activeId === id || !current.canvases.some((c) => c.id === id)) return;
  commit({ ...current, activeId: id });
}

export function renameCanvas(id: string, name: string) {
  const current = getCanvases();
  const trimmed = name.trim();
  if (!trimmed) return;
  commit({ ...current, canvases: current.canvases.map((c) => (c.id === id ? { ...c, name: trimmed } : c)) });
}

/** set a canvas's icon to one of CANVAS_ICONS' keys, or clear it (null) to
    fall back to the first-letter-of-name glyph */
export function setCanvasIcon(id: string, icon: string | null) {
  const current = getCanvases();
  if (icon !== null && !isCanvasIconName(icon)) return;
  commit({
    ...current,
    canvases: current.canvases.map((c) => {
      if (c.id !== id) return c;
      if (icon === null) {
        const rest = { ...c };
        delete rest.icon;
        return rest;
      }
      return { ...c, icon };
    }),
  });
}

/** drop a canvas and all its namespaced data (layout, theme, palette);
    always keeps at least one canvas around, and falls back to the first
    remaining one if the active canvas was deleted */
export function deleteCanvas(id: string) {
  const current = getCanvases();
  if (current.canvases.length <= 1) return;
  const canvases = current.canvases.filter((c) => c.id !== id);
  if (canvases.length === current.canvases.length) return;
  const activeId = current.activeId === id ? canvases[0].id : current.activeId;
  commit({ canvases, activeId });
  try {
    localStorage.removeItem(slotLayoutKey(id));
    localStorage.removeItem(canvasScopedKey("nutmag-theme", id));
    localStorage.removeItem(canvasScopedKey("nutmag-palette", id));
  } catch {
    // ignore
  }
}

/** swap a canvas with its immediate left/right neighbor in the tab order */
export function reorderCanvas(id: string, direction: -1 | 1) {
  const current = getCanvases();
  const index = current.canvases.findIndex((c) => c.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= current.canvases.length) return;
  const canvases = [...current.canvases];
  [canvases[index], canvases[target]] = [canvases[target], canvases[index]];
  commit({ ...current, canvases });
}

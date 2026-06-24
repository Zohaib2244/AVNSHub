// Canvases store — Arc-spaces-style named layouts. Mirrors the lib/theme.ts /
// lib/prefs.ts external-store pattern: module-level cache, listener set,
// persist-on-commit to localStorage["nutmag-canvases"]. Each canvas only
// tracks identity (id/name) here; the widget arrangement itself still lives
// in lib/slotLayout.ts, namespaced per canvas via slotLayoutKey() so this
// module never needs to know about widgets.

export type Canvas = { id: string; name: string };

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

/** the lib/slotLayout.ts storage key for a given canvas — kept here so
    deleteCanvas() can clean up after itself without importing slotLayout.ts */
export function slotLayoutKey(canvasId: string): string {
  return canvasId === DEFAULT_CANVAS_ID ? "nutmag-slot-layout" : `nutmag-slot-layout::${canvasId}`;
}

function sanitize(raw: unknown): CanvasesState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const stored = raw as Record<string, unknown>;
  if (!Array.isArray(stored.canvases)) return null;

  const seen = new Set<string>();
  const canvases: Canvas[] = [];
  for (const item of stored.canvases) {
    if (!item || typeof item !== "object") continue;
    const { id, name } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof name !== "string" || !name.trim() || seen.has(id)) continue;
    seen.add(id);
    canvases.push({ id, name });
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

/** drop a canvas and its slot-layout data; always keeps at least one canvas
    around, and falls back to the first remaining one if the active canvas
    was deleted */
export function deleteCanvas(id: string) {
  const current = getCanvases();
  if (current.canvases.length <= 1) return;
  const canvases = current.canvases.filter((c) => c.id !== id);
  if (canvases.length === current.canvases.length) return;
  const activeId = current.activeId === id ? canvases[0].id : current.activeId;
  commit({ canvases, activeId });
  try {
    localStorage.removeItem(slotLayoutKey(id));
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

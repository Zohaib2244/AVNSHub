// Shared layout store — a single ordered list of widget instances, each
// carrying its grid placement config (size, orientation, expansion) and
// widget-specific settings. Mirrors the lib/theme.ts external-store pattern:
// the server renders the defaults, the client lazily reads the saved state
// from localStorage["nutmag-layout"]. Every mutation persists immediately.

import {
  DEFAULT_ORDER,
  WIDGETS,
  getManifest,
  resolveSettings,
  type Orientation,
  type SettingsValues,
  type WidgetId,
  type WidgetManifest,
  type WidgetSize,
} from "@/config/widgets";
import { CUSTOM_WIDGETS, CUSTOM_DEFAULT_ORDER } from "@/config/customWidgets";

export type WidgetInstance = {
  /** built-in widget id (WidgetId) or a custom widget slug (string) */
  id: string;
  size: WidgetSize;
  orientation: Orientation;
  hidden: boolean;
  settings: SettingsValues;
};

export type LayoutState = {
  version: 2;
  /** list order = grid placement order (dense auto-flow back-fills gaps) */
  widgets: WidgetInstance[];
};

const STORAGE_KEY = "nutmag-layout";
const listeners = new Set<() => void>();

let layout: LayoutState | null = null;
let defaultLayout: LayoutState | null = null;

export function defaultInstance(id: string): WidgetInstance {
  const manifest = getManifest(id);
  if (!manifest) throw new Error(`Unknown widget id: ${id}`);
  const defaults: WidgetManifest["defaults"] = manifest.defaults;
  return {
    id,
    size: defaults.size,
    orientation: defaults.orientation,
    hidden: defaults.hidden ?? false,
    settings: resolveSettings(manifest),
  };
}

function buildDefaultLayout(): LayoutState {
  if (!defaultLayout) {
    const all = [...DEFAULT_ORDER, ...CUSTOM_DEFAULT_ORDER.filter((id) => !DEFAULT_ORDER.includes(id as WidgetId))];
    defaultLayout = { version: 2, widgets: all.map(defaultInstance) };
  }
  return defaultLayout;
}

/* v1 layouts were Record<columnId, widgetId[]>; flatten them in the old
   visual column order and expand the ids of the dissolved pair wrappers */
const V1_COLUMN_ORDER = ["left", "services", "center", "tracker"];
const V1_PAIR_IDS: Record<string, WidgetId[]> = {
  media: ["now-playing", "currently-playing"],
  "disk-network": ["disk-storage", "network-stats"],
};

function isKnownId(id: string): boolean {
  return id in WIDGETS || id in CUSTOM_WIDGETS;
}

function migrateV1(stored: Record<string, unknown>): string[] {
  const order: string[] = [];
  const keys = [...V1_COLUMN_ORDER, ...Object.keys(stored).filter((k) => !V1_COLUMN_ORDER.includes(k))];
  for (const key of keys) {
    const ids = stored[key];
    if (!Array.isArray(ids)) continue;
    for (const raw of ids) {
      if (typeof raw !== "string") continue;
      const expanded: string[] = V1_PAIR_IDS[raw] ?? (isKnownId(raw) ? [raw] : []);
      for (const id of expanded) {
        if (!order.includes(id)) order.push(id);
      }
    }
  }
  return order;
}

function clamp<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/* a stored layout may predate widgets added since (or contain ids/values
   that no longer exist) — keep what's valid, fall back per-field to the
   manifest defaults, and append missing widgets so none can ever disappear */
function sanitize(raw: unknown): LayoutState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const stored = raw as Record<string, unknown>;

  const seen = new Set<string>();
  const widgets: WidgetInstance[] = [];

  function push(id: string, item?: Record<string, unknown>) {
    if (seen.has(id)) return;
    seen.add(id);
    const manifest = getManifest(id);
    if (!manifest) return;
    const base = defaultInstance(id);
    widgets.push(
      item
        ? {
            id,
            size: clamp(item.size, manifest.sizes, base.size),
            orientation: clamp(item.orientation, manifest.orientations, base.orientation),
            hidden: typeof item.hidden === "boolean" ? item.hidden : base.hidden,
            settings: resolveSettings(
              manifest,
              item.settings && typeof item.settings === "object" ? (item.settings as SettingsValues) : undefined,
            ),
          }
        : base,
    );
  }

  if (stored.version === 2 && Array.isArray(stored.widgets)) {
    for (const item of stored.widgets) {
      if (!item || typeof item !== "object") continue;
      const id = (item as Record<string, unknown>).id;
      if (typeof id === "string" && isKnownId(id)) push(id, item as Record<string, unknown>);
    }
  } else if (stored.version === undefined) {
    for (const id of migrateV1(stored)) push(id);
  } else {
    return null;
  }

  // anything registered since the layout was saved joins at the end
  for (const id of DEFAULT_ORDER) {
    if (!seen.has(id)) push(id);
  }
  for (const id of CUSTOM_DEFAULT_ORDER) {
    if (!seen.has(id)) push(id);
  }

  return { version: 2, widgets };
}

export function getLayout(): LayoutState {
  if (layout === null) {
    layout = buildDefaultLayout();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cleaned = sanitize(JSON.parse(raw));
        if (cleaned) layout = cleaned;
      }
    } catch {
      // corrupt saved layout — keep the default
    }
  }
  return layout;
}

export function getServerLayout(): LayoutState {
  return buildDefaultLayout();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // storage full/blocked — layout still applies for this session
  }
}

function commit(next: LayoutState) {
  layout = next;
  persist();
  listeners.forEach((listener) => listener());
}

/** add a widget that exists in the registry but isn't yet in the layout store */
export function addWidget(id: string): void {
  const manifest = getManifest(id);
  if (!manifest) return;
  const current = getLayout();
  if (current.widgets.some((w) => w.id === id)) {
    // already tracked — just make it visible
    updateInstance(id, { hidden: false });
    return;
  }
  commit({ version: 2, widgets: [...current.widgets, defaultInstance(id)] });
}

/** move `activeId` to `overId`'s position (dnd live reorder) */
export function reorderWidget(activeId: string, overId: string) {
  const current = getLayout();
  const from = current.widgets.findIndex((w) => w.id === activeId);
  const to = current.widgets.findIndex((w) => w.id === overId);
  if (from === -1 || to === -1 || from === to) return;
  const widgets = [...current.widgets];
  const [moved] = widgets.splice(from, 1);
  widgets.splice(to, 0, moved);
  commit({ version: 2, widgets });
}

export function updateInstance(id: string, patch: Partial<Omit<WidgetInstance, "id">>) {
  const current = getLayout();
  commit({
    version: 2,
    widgets: current.widgets.map((w) =>
      w.id === id ? { ...w, ...patch, settings: { ...w.settings, ...patch.settings } } : w,
    ),
  });
}

export function resetLayout() {
  layout = buildDefaultLayout();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener());
}

export function subscribeLayout(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Slot Layout placement store — mirrors lib/layout.ts's useSyncExternalStore
// pattern (module-level cache, listener set, persist-on-commit), but for the
// region-based "Preferred Layout" mode (config/slotLayout.ts). Unlike Graph
// Layout, placement here is 100% manual and never auto-arranged: "placed" is
// "visible" — there's no hidden flag, removing a widget just drops it back
// into the unplaced pool. sanitize() drops invalid/overlapping entries back
// to that pool rather than trying to auto-correct them.

import {
  DEFAULT_FRAME_RATIOS,
  FRAME_RATIO_MIN_FR,
  REGION_GRID,
  TERMINAL_REGION,
  clampRegionDims,
  minFootprint,
  type FrameRatios,
  type RegionDims,
  type SlotRegionId,
} from "@/config/slotLayout";
import { WIDGETS, getManifest, resolveSettings, type SettingsValues, type WidgetId } from "@/config/widgets";
import { CUSTOM_WIDGETS } from "@/config/customWidgets";
import { buildOccupancy, canPlace, findFit, isValidPlacement, type Rect } from "@/lib/grid/occupancy";

const REGION_IDS = Object.keys(REGION_GRID) as SlotRegionId[];

export type SlotWidgetInstance = {
  id: string;
  region: SlotRegionId;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  settings: SettingsValues;
};

export type SlotLayoutState = {
  version: 3;
  /** order is insignificant — placement is purely positional (region + rect) */
  widgets: SlotWidgetInstance[];
  terminalWidgetId: string | null;
  /** per-region grid dims, editable via AVN Hub Core Settings; defaults to
      REGION_GRID */
  regionDims: Record<SlotRegionId, RegionDims>;
  /** macro column/row proportions for .slot-frame/.slot-center, adjustable
      via drag handles on the terminal cell; defaults to DEFAULT_FRAME_RATIOS */
  frameRatios: FrameRatios;
};

const STORAGE_KEY = "nutmag-slot-layout";
const listeners = new Set<() => void>();

let state: SlotLayoutState | null = null;
let defaultState: SlotLayoutState | null = null;

function rectOf(instance: SlotWidgetInstance): Rect {
  return { col: instance.col, row: instance.row, colSpan: instance.colSpan, rowSpan: instance.rowSpan };
}

/* canonical default layout — exported from the browser after manual
   arrangement, then baked in here so a fresh session (or "reset layout")
   starts from this exact state */
function buildDefaultState(): SlotLayoutState {
  if (!defaultState) {
    // helper: skip any widget whose manifest isn't registered yet
    // (e.g. custom widgets absent on a fresh install)
    function entry(
      id: string,
      region: SlotRegionId,
      col: number,
      row: number,
      colSpan: number,
      rowSpan: number,
      overrides: SettingsValues = {},
    ): SlotWidgetInstance | null {
      const manifest = getManifest(id);
      if (!manifest) return null;
      return { id, region, col, row, colSpan, rowSpan, settings: resolveSettings(manifest, overrides) };
    }

    defaultState = {
      version: 3,
      regionDims: {
        left:  { cols: 2, rows: 8 },
        right: { cols: 2, rows: 8 },
        base:  { cols: 3, rows: 2 },
      },
      frameRatios: {
        columns:    [2, 3, 2] as FrameRatios["columns"],
        centerRows: [5, 5]    as FrameRatios["centerRows"],
      },
      widgets: [
        // ── left column ──────────────────────────────────────────
        entry("clock",          "left",  0, 0, 2, 2, { hoverExpand: true,  hoverExpandAxis: "height", showCalendar: true, showLofi: true }),
        entry("now-playing",    "left",  0, 2, 1, 1, { hoverExpand: true,  hoverExpandAxis: "both" }),
        entry("weather",        "left",  1, 2, 1, 1, { hoverExpand: true,  hoverExpandAxis: "width", city: "", units: "f" }),
        entry("disk-storage",   "left",  0, 3, 1, 1, { hoverExpand: true,  hoverExpandAxis: "height" }),
        entry("server-stats",   "left",  1, 3, 1, 3, { hoverExpand: true,  hoverExpandAxis: "both" }),
        entry("storage-apps",   "left",  0, 4, 1, 1, { hoverExpand: true,  hoverExpandAxis: "width" }),
        entry("network-stats",  "left",  0, 5, 1, 1, { hoverExpand: false, hoverExpandAxis: "both" }),
        entry("arr-stack",      "left",  0, 6, 2, 1, { hoverExpand: true,  hoverExpandAxis: "both" }),
        // ── right column ─────────────────────────────────────────
        entry("currently-playing", "right", 0, 0, 2, 2, { hoverExpand: true,  hoverExpandAxis: "both" }),
        entry("homelab",        "right", 0, 2, 2, 2, { hoverExpand: true,  hoverExpandAxis: "both", pollSeconds: "60" }),
        entry("hub-settings",   "right", 0, 4, 2, 1, { hoverExpand: true,  hoverExpandAxis: "both" }),
        entry("widgets",        "right", 0, 5, 1, 3, { hoverExpand: false, hoverExpandAxis: "height" }),
        // ── base row ─────────────────────────────────────────────
        entry("identity",       "base",  0, 0, 3, 1, { hoverExpand: false, hoverExpandAxis: "height" }),
        entry("github",         "base",  0, 1, 3, 1, { hoverExpand: true,  hoverExpandAxis: "height", flyoutCommits: 5 }),
      ].filter((w): w is SlotWidgetInstance => w !== null),
      terminalWidgetId: TERMINAL_REGION.defaultWidget,
    };
  }
  return defaultState;
}

function isRegionId(value: unknown): value is SlotRegionId {
  return value === "left" || value === "right" || value === "base";
}

/* a stored layout may predate regionDims (version 1) — default every region
   to REGION_GRID. A version-2 regionDims is validated per-region, falling
   back to REGION_GRID for any region missing/corrupt. */
function sanitizeRegionDims(raw: unknown): Record<SlotRegionId, RegionDims> {
  const result = { ...REGION_GRID } as Record<SlotRegionId, RegionDims>;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  const stored = raw as Record<string, unknown>;

  for (const region of REGION_IDS) {
    const entry = stored[region];
    if (!entry || typeof entry !== "object") continue;
    const { cols, rows } = entry as Record<string, unknown>;
    if (typeof cols === "number" && typeof rows === "number" && Number.isInteger(cols) && Number.isInteger(rows)) {
      result[region] = clampRegionDims({ cols, rows });
    }
  }
  return result;
}

function isFrTuple(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((v) => typeof v === "number" && Number.isInteger(v) && v >= FRAME_RATIO_MIN_FR)
  );
}

/* a stored layout may predate frameRatios (version < 3) — default to
   DEFAULT_FRAME_RATIOS. A version-3 frameRatios is validated per-field,
   falling back to the default for any field missing/corrupt. */
function sanitizeFrameRatios(raw: unknown): FrameRatios {
  const result: FrameRatios = {
    columns: [...DEFAULT_FRAME_RATIOS.columns] as FrameRatios["columns"],
    centerRows: [...DEFAULT_FRAME_RATIOS.centerRows] as FrameRatios["centerRows"],
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  const stored = raw as Record<string, unknown>;

  if (isFrTuple(stored.columns, 3)) result.columns = stored.columns as FrameRatios["columns"];
  if (isFrTuple(stored.centerRows, 2)) result.centerRows = stored.centerRows as FrameRatios["centerRows"];
  return result;
}

/* a stored layout may predate widgets added since, reference unknown ids, or
   (after manual localStorage edits) contain out-of-bounds/overlapping rects
   — keep only entries that pass isValidPlacement against siblings already
   accepted; everything else silently returns to the unplaced pool */
function sanitize(raw: unknown): SlotLayoutState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const stored = raw as Record<string, unknown>;
  if (stored.version !== 1 && stored.version !== 2 && stored.version !== 3) return null;

  const regionDims =
    stored.version === 2 || stored.version === 3
      ? sanitizeRegionDims(stored.regionDims)
      : ({ ...REGION_GRID } as Record<SlotRegionId, RegionDims>);
  const frameRatios =
    stored.version === 3
      ? sanitizeFrameRatios(stored.frameRatios)
      : {
          columns: [...DEFAULT_FRAME_RATIOS.columns] as FrameRatios["columns"],
          centerRows: [...DEFAULT_FRAME_RATIOS.centerRows] as FrameRatios["centerRows"],
        };

  const seen = new Set<string>();
  const byRegion: Record<SlotRegionId, Rect[]> = { left: [], right: [], base: [] };
  const widgets: SlotWidgetInstance[] = [];

  if (Array.isArray(stored.widgets)) {
    for (const item of stored.widgets) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;

      const id = it.id;
      if (typeof id !== "string" || !(id in WIDGETS || id in CUSTOM_WIDGETS) || seen.has(id)) continue;

      const region = it.region;
      if (!isRegionId(region)) continue;

      const { col, row, colSpan, rowSpan } = it;
      if (![col, row, colSpan, rowSpan].every((v) => typeof v === "number" && Number.isInteger(v))) continue;
      const rect: Rect = { col: col as number, row: row as number, colSpan: colSpan as number, rowSpan: rowSpan as number };

      const min = minFootprint(id);
      if (rect.colSpan < min.colSpan || rect.rowSpan < min.rowSpan) continue;

      const dims = regionDims[region];
      if (!isValidPlacement(dims, [...byRegion[region], rect])) continue;

      const manifest = getManifest(id);
      if (!manifest) continue;

      seen.add(id);
      byRegion[region].push(rect);
      widgets.push({
        id,
        region,
        ...rect,
        settings: resolveSettings(
          manifest,
          it.settings && typeof it.settings === "object" ? (it.settings as SettingsValues) : undefined,
        ),
      });
    }
  }

  const terminal = stored.terminalWidgetId;
  const terminalWidgetId =
    typeof terminal === "string" && (terminal in WIDGETS || terminal in CUSTOM_WIDGETS) && !seen.has(terminal)
      ? terminal
      : null;

  return { version: 3, widgets, terminalWidgetId, regionDims, frameRatios };
}

export function getSlotLayout(): SlotLayoutState {
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

export function getServerSlotLayout(): SlotLayoutState {
  return buildDefaultState();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full/blocked — state still applies for this session
  }
}

function commit(next: SlotLayoutState) {
  state = next;
  persist();
  listeners.forEach((listener) => listener());
}

export function subscribeSlotLayout(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** widgets that aren't placed in any region and aren't the terminal occupant
    — the candidates offered by the placement popover */
export function getUnplacedWidgets(): string[] {
  const current = getSlotLayout();
  const placed = new Set<string>(current.widgets.map((w) => w.id));
  if (current.terminalWidgetId) placed.add(current.terminalWidgetId);
  const builtIn = (Object.keys(WIDGETS) as string[]).filter((id) => !placed.has(id));
  const custom = Object.keys(CUSTOM_WIDGETS).filter((id) => !placed.has(id));
  return [...builtIn, ...custom];
}

/** place an unplaced widget at the first cell in `region` that fits its
    minimum footprint; no-op if already placed or the region is full */
export function placeWidget(id: string, region: SlotRegionId) {
  const current = getSlotLayout();
  if (current.widgets.some((w) => w.id === id) || current.terminalWidgetId === id) return;

  const manifest = getManifest(id);
  if (!manifest) return;

  const dims = current.regionDims[region];
  const occupancy = buildOccupancy(dims, current.widgets.filter((w) => w.region === region).map(rectOf));
  const footprint = minFootprint(id);
  const spot = findFit(dims, occupancy, footprint);
  if (!spot) return;

  commit({
    ...current,
    widgets: [
      ...current.widgets,
      { id, region, col: spot.col, row: spot.row, colSpan: footprint.colSpan, rowSpan: footprint.rowSpan, settings: resolveSettings(manifest) },
    ],
  });
}

/** try to place an unplaced widget in the first region that has room;
    returns the region it was placed in, or null if all regions are full */
export function placeWidgetAuto(id: string): SlotRegionId | null {
  for (const region of REGION_IDS) {
    const before = getSlotLayout().widgets.filter((w) => w.region === region).length;
    placeWidget(id, region);
    const after = getSlotLayout().widgets.filter((w) => w.region === region).length;
    if (after > before) return region;
  }
  return null;
}

/** un-place a widget, returning it to the pool */
export function removeWidget(id: string) {
  const current = getSlotLayout();
  if (!current.widgets.some((w) => w.id === id)) return;
  commit({ ...current, widgets: current.widgets.filter((w) => w.id !== id) });
}

/** update the settings stored on a placed slot widget */
export function updateWidgetSettings(id: string, settings: SettingsValues) {
  const current = getSlotLayout();
  const instance = current.widgets.find((w) => w.id === id);
  if (!instance) return;

  const manifest = getManifest(id);
  if (!manifest) return;

  const nextSettings = resolveSettings(manifest, { ...instance.settings, ...settings });
  commit({
    ...current,
    widgets: current.widgets.map((w) => (w.id === id ? { ...w, settings: nextSettings } : w)),
  });
}

/** set/clear the terminal slot's occupant; if `id` was placed in a region
    it's removed from there first */
export function setTerminalWidget(id: string | null) {
  const current = getSlotLayout();
  if (current.terminalWidgetId === id) return;
  commit({
    ...current,
    widgets: id ? current.widgets.filter((w) => w.id !== id) : current.widgets,
    terminalWidgetId: id,
  });
}

/** resize/move commit for a placed widget — validates against `minFootprint`
    and sibling occupancy, no-op if the rect doesn't fit */
export function setWidgetRect(id: string, rect: Rect) {
  const current = getSlotLayout();
  const instance = current.widgets.find((w) => w.id === id);
  if (!instance) return;

  const min = minFootprint(id);
  if (rect.colSpan < min.colSpan || rect.rowSpan < min.rowSpan) return;

  const dims = current.regionDims[instance.region];
  const occupancy = buildOccupancy(dims, current.widgets.filter((w) => w.region === instance.region).map(rectOf), rectOf(instance));
  if (!canPlace(rect, dims, occupancy)) return;

  commit({
    ...current,
    widgets: current.widgets.map((w) => (w.id === id ? { ...w, ...rect } : w)),
  });
}

/** current grid dims for a region — AVN Hub Core Settings reads this to
    populate the dims editor */
export function getRegionDims(region: SlotRegionId): RegionDims {
  return getSlotLayout().regionDims[region];
}

/** resize a region's grid (clamped to REGION_DIMS_BOUNDS); widgets in that
    region that no longer fit (e.g. after a shrink) are dropped back to the
    unplaced pool — same "drop, don't auto-correct" rule sanitize() applies
    to a corrupted stored layout */
export function setRegionDims(region: SlotRegionId, dims: RegionDims) {
  const current = getSlotLayout();
  const clamped = clampRegionDims({ cols: Math.round(dims.cols), rows: Math.round(dims.rows) });
  const existing = current.regionDims[region];
  if (clamped.cols === existing.cols && clamped.rows === existing.rows) return;

  const regionRects: Rect[] = [];
  const widgets = current.widgets.filter((w) => {
    if (w.region !== region) return true;
    const rect = rectOf(w);
    if (!isValidPlacement(clamped, [...regionRects, rect])) return false;
    regionRects.push(rect);
    return true;
  });

  commit({ ...current, regionDims: { ...current.regionDims, [region]: clamped }, widgets });
}

/** macro column/row proportions for .slot-frame/.slot-center — read by
    SlotDashboard to size the frame and by the terminal's resize handles to
    compute drag deltas */
export function getFrameRatios(): FrameRatios {
  return getSlotLayout().frameRatios;
}

/** commit a new frame/center fr split (terminal resize handles) — values
    are rounded and clamped to FRAME_RATIO_MIN_FR; callers are expected to
    preserve each pair's sum (one region's gain is the adjacent region's
    loss) so the overall frame proportions stay stable */
export function setFrameRatios(ratios: FrameRatios) {
  const current = getSlotLayout();
  const next: FrameRatios = {
    columns: ratios.columns.map((v) => Math.max(FRAME_RATIO_MIN_FR, Math.round(v))) as FrameRatios["columns"],
    centerRows: ratios.centerRows.map((v) => Math.max(FRAME_RATIO_MIN_FR, Math.round(v))) as FrameRatios["centerRows"],
  };
  if (JSON.stringify(next) === JSON.stringify(current.frameRatios)) return;
  commit({ ...current, frameRatios: next });
}

export function resetSlotLayout() {
  state = buildDefaultState();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener());
}

/** import a previously-exported slot layout JSON; runs through sanitize()
    so invalid/unknown widget ids and out-of-bounds rects are silently dropped.
    Returns true on success, false if the JSON shape isn't recognisable. */
export function importSlotLayout(raw: unknown): boolean {
  const cleaned = sanitize(raw);
  if (!cleaned) return false;
  commit(cleaned);
  return true;
}

/** export the current slot layout as a downloadable JSON file */
export function exportSlotLayout(): void {
  const current = getSlotLayout();
  const json = JSON.stringify(current, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nutmag-slot-layout.json";
  a.click();
  URL.revokeObjectURL(url);
}

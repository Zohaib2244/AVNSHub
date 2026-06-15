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
import { WIDGETS, resolveSettings, type SettingsValues, type WidgetId } from "@/config/widgets";
import { buildOccupancy, canPlace, findFit, isValidPlacement, type Rect } from "@/lib/grid/occupancy";

const REGION_IDS = Object.keys(REGION_GRID) as SlotRegionId[];

export type SlotWidgetInstance = {
  id: WidgetId;
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
  terminalWidgetId: WidgetId | null;
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

/* a small sample placement so regions aren't empty on first load — purely
   a starting point, the user rearranges everything in edit mode */
function buildDefaultState(): SlotLayoutState {
  if (!defaultState) {
    defaultState = {
      version: 3,
      regionDims: { ...REGION_GRID },
      frameRatios: {
        columns: [...DEFAULT_FRAME_RATIOS.columns] as FrameRatios["columns"],
        centerRows: [...DEFAULT_FRAME_RATIOS.centerRows] as FrameRatios["centerRows"],
      },
      widgets: [
        { id: "clock", region: "left", col: 0, row: 0, colSpan: 2, rowSpan: 2, settings: resolveSettings(WIDGETS.clock) },
        {
          id: "now-playing",
          region: "left",
          col: 0,
          row: 2,
          colSpan: 2,
          rowSpan: 2,
          settings: resolveSettings(WIDGETS["now-playing"]),
        },
        {
          id: "currently-playing",
          region: "right",
          col: 0,
          row: 0,
          colSpan: 2,
          rowSpan: 2,
          settings: resolveSettings(WIDGETS["currently-playing"]),
        },
        { id: "homelab", region: "right", col: 0, row: 2, colSpan: 2, rowSpan: 2, settings: resolveSettings(WIDGETS.homelab) },
        {
          id: "identity",
          region: "base",
          col: 0,
          row: 0,
          colSpan: 3,
          rowSpan: 1,
          settings: resolveSettings(WIDGETS.identity),
        },
        { id: "github", region: "base", col: 0, row: 1, colSpan: 3, rowSpan: 1, settings: resolveSettings(WIDGETS.github) },
      ],
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

  const seen = new Set<WidgetId>();
  const byRegion: Record<SlotRegionId, Rect[]> = { left: [], right: [], base: [] };
  const widgets: SlotWidgetInstance[] = [];

  if (Array.isArray(stored.widgets)) {
    for (const item of stored.widgets) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;

      const id = it.id;
      if (typeof id !== "string" || !(id in WIDGETS) || seen.has(id as WidgetId)) continue;

      const region = it.region;
      if (!isRegionId(region)) continue;

      const { col, row, colSpan, rowSpan } = it;
      if (![col, row, colSpan, rowSpan].every((v) => typeof v === "number" && Number.isInteger(v))) continue;
      const rect: Rect = { col: col as number, row: row as number, colSpan: colSpan as number, rowSpan: rowSpan as number };

      const min = minFootprint(id as WidgetId);
      if (rect.colSpan < min.colSpan || rect.rowSpan < min.rowSpan) continue;

      const dims = regionDims[region];
      if (!isValidPlacement(dims, [...byRegion[region], rect])) continue;

      seen.add(id as WidgetId);
      byRegion[region].push(rect);
      widgets.push({
        id: id as WidgetId,
        region,
        ...rect,
        settings: resolveSettings(
          WIDGETS[id as WidgetId],
          it.settings && typeof it.settings === "object" ? (it.settings as SettingsValues) : undefined,
        ),
      });
    }
  }

  const terminal = stored.terminalWidgetId;
  const terminalWidgetId =
    typeof terminal === "string" && terminal in WIDGETS && !seen.has(terminal as WidgetId)
      ? (terminal as WidgetId)
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
export function getUnplacedWidgets(): WidgetId[] {
  const current = getSlotLayout();
  const placed = new Set<WidgetId>(current.widgets.map((w) => w.id));
  if (current.terminalWidgetId) placed.add(current.terminalWidgetId);
  return (Object.keys(WIDGETS) as WidgetId[]).filter((id) => !placed.has(id));
}

/** place an unplaced widget at the first cell in `region` that fits its
    minimum footprint; no-op if already placed or the region is full */
export function placeWidget(id: WidgetId, region: SlotRegionId) {
  const current = getSlotLayout();
  if (current.widgets.some((w) => w.id === id) || current.terminalWidgetId === id) return;

  const dims = current.regionDims[region];
  const occupancy = buildOccupancy(dims, current.widgets.filter((w) => w.region === region).map(rectOf));
  const footprint = minFootprint(id);
  const spot = findFit(dims, occupancy, footprint);
  if (!spot) return;

  commit({
    ...current,
    widgets: [
      ...current.widgets,
      { id, region, col: spot.col, row: spot.row, colSpan: footprint.colSpan, rowSpan: footprint.rowSpan, settings: resolveSettings(WIDGETS[id]) },
    ],
  });
}

/** un-place a widget, returning it to the pool */
export function removeWidget(id: WidgetId) {
  const current = getSlotLayout();
  if (!current.widgets.some((w) => w.id === id)) return;
  commit({ ...current, widgets: current.widgets.filter((w) => w.id !== id) });
}

/** set/clear the terminal slot's occupant; if `id` was placed in a region
    it's removed from there first */
export function setTerminalWidget(id: WidgetId | null) {
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
export function setWidgetRect(id: WidgetId, rect: Rect) {
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

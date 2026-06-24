// Slot Layout placement store — mirrors lib/layout.ts's useSyncExternalStore
// pattern (module-level cache, listener set, persist-on-commit), but for the
// region-based "Preferred Layout" mode (config/slotLayout.ts). Unlike Graph
// Layout, placement here is 100% manual and never auto-arranged: "placed" is
// "visible" — there's no hidden flag, removing a widget just drops it back
// into the unplaced pool. sanitize() drops invalid/overlapping entries back
// to that pool rather than trying to auto-correct them.
//
// Canvases (lib/canvases.ts) layer multiple named arrangements on top of this
// one store: each canvas gets its own localStorage slot under
// slotLayoutKey(canvasId), and this module reloads `state` whenever the
// active canvas changes (subscribed once at module load below). The
// DEFAULT_CANVAS_ID canvas keeps the baked-in buildDefaultState() arrangement
// for backwards compatibility; every other canvas starts from
// buildEmptyState() — a blank slate the user fills in per-canvas.

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
import { WIDGETS, getManifest, resolveSettings, type SettingsValues } from "@/config/widgets";
import { CUSTOM_WIDGETS } from "@/config/customWidgets";
import { buildOccupancy, canPlace, findFit, isValidPlacement, type Rect } from "@/lib/grid/occupancy";
import { DEFAULT_CANVAS_ID, getActiveCanvasId, slotLayoutKey, subscribeCanvases } from "@/lib/canvases";

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
  /** settings for the terminal occupant, stored separately because the
      terminal is a single fixed slot rather than a SlotWidgetInstance */
  terminalSettings: SettingsValues;
  /** per-region grid dims, editable via AVN Hub Core Settings; defaults to
      REGION_GRID */
  regionDims: Record<SlotRegionId, RegionDims>;
  /** macro column/row proportions for .slot-frame/.slot-center, adjustable
      via drag handles on the terminal cell; defaults to DEFAULT_FRAME_RATIOS */
  frameRatios: FrameRatios;
};

const listeners = new Set<() => void>();

let state: SlotLayoutState | null = null;
let defaultState: SlotLayoutState | null = null;
let emptyState: SlotLayoutState | null = null;
/** which canvas `state` currently holds — null until first load */
let currentCanvasId: string | null = null;

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
        // ── base row ─────────────────────────────────────────────
        entry("identity",       "base",  0, 0, 3, 1, { hoverExpand: false, hoverExpandAxis: "height" }),
        entry("github",         "base",  0, 1, 3, 1, { hoverExpand: true,  hoverExpandAxis: "height", flyoutCommits: 5 }),
      ].filter((w): w is SlotWidgetInstance => w !== null),
      terminalWidgetId: TERMINAL_REGION.defaultWidget,
      terminalSettings: TERMINAL_REGION.defaultWidget
        ? resolveSettings(getManifest(TERMINAL_REGION.defaultWidget)!)
        : {},
    };
  }
  return defaultState;
}

/** the starting state for any canvas other than DEFAULT_CANVAS_ID — a blank
    region grid with nothing placed, so a freshly created canvas is empty
    rather than a duplicate of the baked-in default arrangement */
function buildEmptyState(): SlotLayoutState {
  if (!emptyState) {
    emptyState = {
      version: 3,
      regionDims: { ...REGION_GRID },
      frameRatios: {
        columns: [...DEFAULT_FRAME_RATIOS.columns] as FrameRatios["columns"],
        centerRows: [...DEFAULT_FRAME_RATIOS.centerRows] as FrameRatios["centerRows"],
      },
      widgets: [],
      terminalWidgetId: null,
      terminalSettings: {},
    };
  }
  return emptyState;
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
  const terminalManifest = terminalWidgetId ? getManifest(terminalWidgetId) : null;
  const terminalSettings = terminalManifest
    ? resolveSettings(
        terminalManifest,
        stored.terminalSettings && typeof stored.terminalSettings === "object"
          ? (stored.terminalSettings as SettingsValues)
          : undefined,
      )
    : {};

  return { version: 3, widgets, terminalWidgetId, terminalSettings, regionDims, frameRatios };
}

function loadForCanvas(canvasId: string): SlotLayoutState {
  let next = canvasId === DEFAULT_CANVAS_ID ? buildDefaultState() : buildEmptyState();
  try {
    const raw = localStorage.getItem(slotLayoutKey(canvasId));
    if (raw) {
      const cleaned = sanitize(JSON.parse(raw));
      if (cleaned) next = cleaned;
    }
  } catch {
    // corrupt saved state — keep the default/empty starting point
  }
  return next;
}

export function getSlotLayout(): SlotLayoutState {
  if (state === null) {
    currentCanvasId = getActiveCanvasId();
    state = loadForCanvas(currentCanvasId);
  }
  return state;
}

export function getServerSlotLayout(): SlotLayoutState {
  return buildDefaultState();
}

function persist() {
  try {
    localStorage.setItem(slotLayoutKey(currentCanvasId ?? getActiveCanvasId()), JSON.stringify(state));
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

// reload `state` whenever the active canvas changes — keeps every
// useSyncExternalStore(subscribeSlotLayout, getSlotLayout, ...) consumer in
// sync without each of them needing to know canvases exist
subscribeCanvases(() => {
  const activeId = getActiveCanvasId();
  if (state !== null && activeId === currentCanvasId) return;
  currentCanvasId = activeId;
  state = loadForCanvas(activeId);
  listeners.forEach((listener) => listener());
});

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

/** place an unplaced widget at `preferredCell` if it fits, otherwise the
    first available cell in `region`; no-op if already placed or region is full */
export function placeWidget(id: string, region: SlotRegionId, preferredCell?: { col: number; row: number }): boolean {
  const current = getSlotLayout();
  if (current.widgets.some((w) => w.id === id) || current.terminalWidgetId === id) return false;

  const manifest = getManifest(id);
  if (!manifest) return false;

  const dims = current.regionDims[region];
  const occupancy = buildOccupancy(dims, current.widgets.filter((w) => w.region === region).map(rectOf));
  const footprint = minFootprint(id);
  const spot = findFit(dims, occupancy, footprint, preferredCell);
  if (!spot) return false;

  commit({
    ...current,
    widgets: [
      ...current.widgets,
      { id, region, col: spot.col, row: spot.row, colSpan: footprint.colSpan, rowSpan: footprint.rowSpan, settings: resolveSettings(manifest) },
    ],
  });
  return true;
}

export function getRegionsThatFitWidget(id: string, layout: SlotLayoutState = getSlotLayout()): SlotRegionId[] {
  if (layout.widgets.some((w) => w.id === id) || layout.terminalWidgetId === id) return [];
  if (!getManifest(id)) return [];

  const footprint = minFootprint(id);
  return REGION_IDS.filter((region) => {
    const dims = layout.regionDims[region];
    const occupancy = buildOccupancy(dims, layout.widgets.filter((w) => w.region === region).map(rectOf));
    return findFit(dims, occupancy, footprint) !== null;
  });
}

/** try to place an unplaced widget in the first region that has room;
    returns the region it was placed in, or null if all regions are full */
export function placeWidgetAuto(id: string): SlotRegionId | null {
  for (const region of REGION_IDS) {
    if (placeWidget(id, region)) return region;
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

/** update settings for the widget occupying the fixed terminal slot */
export function updateTerminalWidgetSettings(settings: SettingsValues) {
  const current = getSlotLayout();
  const id = current.terminalWidgetId;
  if (!id) return;

  const manifest = getManifest(id);
  if (!manifest) return;

  commit({
    ...current,
    terminalSettings: resolveSettings(manifest, { ...current.terminalSettings, ...settings }),
  });
}

/** set/clear the terminal slot's occupant; if `id` was placed in a region
    it's removed from there first */
export function setTerminalWidget(id: string | null) {
  const current = getSlotLayout();
  if (current.terminalWidgetId === id) return;
  const placedInstance = id ? current.widgets.find((w) => w.id === id) : undefined;
  const manifest = id ? getManifest(id) : null;
  commit({
    ...current,
    widgets: id ? current.widgets.filter((w) => w.id !== id) : current.widgets,
    terminalWidgetId: id,
    terminalSettings: manifest ? resolveSettings(manifest, placedInstance?.settings) : {},
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

/** reset the active canvas's layout back to its starting point — the baked-in
    arrangement for DEFAULT_CANVAS_ID, or an empty grid for any other canvas */
export function resetSlotLayout() {
  const id = currentCanvasId ?? getActiveCanvasId();
  state = id === DEFAULT_CANVAS_ID ? buildDefaultState() : buildEmptyState();
  try {
    localStorage.removeItem(slotLayoutKey(id));
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

export type PlacementSnapshot =
  | { kind: "region"; region: SlotRegionId; col: number; row: number; colSpan: number; rowSpan: number; settings: SettingsValues }
  | { kind: "terminal"; settings: SettingsValues }
  | { kind: "none" };

/** read a widget's current placement without mutating anything */
export function getPlacementSnapshot(id: string): PlacementSnapshot {
  const current = getSlotLayout();
  const instance = current.widgets.find((w) => w.id === id);
  if (instance) {
    return {
      kind: "region",
      region: instance.region,
      col: instance.col,
      row: instance.row,
      colSpan: instance.colSpan,
      rowSpan: instance.rowSpan,
      settings: instance.settings,
    };
  }
  if (current.terminalWidgetId === id) return { kind: "terminal", settings: current.terminalSettings };
  return { kind: "none" };
}

/** remove a widget from its current placement (region or terminal) and
    return a snapshot for restorePlacementSnapshot() — used by the Widget
    Creator to pull a widget off the visible canvas while an edit run is live
    overwriting its source file, so the browser never has to compile a
    possibly-broken intermediate version of an already-working widget. */
export function unplaceWidgetTemporarily(id: string): PlacementSnapshot {
  const snapshot = getPlacementSnapshot(id);
  if (snapshot.kind === "region") removeWidget(id);
  else if (snapshot.kind === "terminal") setTerminalWidget(null);
  return snapshot;
}

/** restore a widget to the placement captured by getPlacementSnapshot() /
    unplaceWidgetTemporarily(). Falls back to placeWidgetAuto() if the
    original cell no longer fits. Returns true if the widget ended up placed
    (or didn't need to be), false if no fit could be found anywhere. */
export function restorePlacementSnapshot(id: string, snapshot: PlacementSnapshot): boolean {
  if (snapshot.kind === "none") return true;
  const current = getSlotLayout();
  if (current.widgets.some((w) => w.id === id) || current.terminalWidgetId === id) return true;

  if (snapshot.kind === "terminal") {
    setTerminalWidget(id);
    updateTerminalWidgetSettings(snapshot.settings);
    return true;
  }

  const manifest = getManifest(id);
  if (!manifest) return false;
  const dims = current.regionDims[snapshot.region];
  const occupancy = buildOccupancy(dims, current.widgets.filter((w) => w.region === snapshot.region).map(rectOf));
  const rect: Rect = { col: snapshot.col, row: snapshot.row, colSpan: snapshot.colSpan, rowSpan: snapshot.rowSpan };
  if (canPlace(rect, dims, occupancy)) {
    commit({
      ...current,
      widgets: [...current.widgets, { id, region: snapshot.region, ...rect, settings: snapshot.settings }],
    });
    return true;
  }
  return placeWidgetAuto(id) !== null;
}

/** swap a placed widget's id in-place (region instance or terminal slot) —
    used after a Widget Creator slug rename so an existing placement survives
    under the new id instead of falling back to "unplaced". */
export function renameWidgetPlacement(oldId: string, newId: string): void {
  const current = getSlotLayout();
  if (current.terminalWidgetId === oldId) {
    commit({ ...current, terminalWidgetId: newId });
    return;
  }
  if (current.widgets.some((w) => w.id === oldId)) {
    commit({ ...current, widgets: current.widgets.map((w) => (w.id === oldId ? { ...w, id: newId } : w)) });
  }
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

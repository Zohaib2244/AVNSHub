"use client";

// AVN Hub Core Settings — a fixed top-right area with tab controls:
// 1. A persistent edit-mode toggle (wrench/lock) — always visible, one click.
// 2. A settings gear that opens canvas appearance, prefs, and layout controls.
// 3. A widget manager tab that opens add/remove controls.

import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Download,
  LayoutGrid,
  Lock,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sun,
  SunMoon,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { CanvasGlyph, CanvasSwitcher } from "@/components/dashboard/CanvasSwitcher";
import { CanvasIconPicker } from "@/components/dashboard/CanvasIconPicker";
import {
  createCanvas,
  deleteCanvas,
  getCanvases,
  getServerCanvases,
  renameCanvas,
  setCanvasIcon,
  subscribeCanvases,
  type Canvas,
} from "@/lib/canvases";
import { CUSTOM_WIDGETS } from "@/config/customWidgets";
import { DEFAULT_ORDER, WIDGETS, getManifest, type WidgetManifest } from "@/config/widgets";
import { THEME_PACKS } from "@/config/themes";
import {
  getPalette,
  getServerPalette,
  getServerThemeMode,
  getThemeMode,
  setPalette,
  setThemeMode,
  subscribeTheme,
  type ThemeMode,
} from "@/lib/theme";
import { getPrefs, getServerPrefs, setPrefs, subscribePrefs } from "@/lib/prefs";
import {
  exportSlotLayout,
  getRegionsThatFitWidget,
  getSlotLayout,
  getServerSlotLayout,
  importSlotLayout,
  placeWidget,
  removeWidget as removeSlotWidget,
  resetSlotLayout,
  setRegionDims,
  setTerminalWidget,
  subscribeSlotLayout,
} from "@/lib/slotLayout";
import { REGION_DIMS_BOUNDS, REGION_LABELS, type RegionDims, type SlotRegionId } from "@/config/slotLayout";

const REGION_IDS: SlotRegionId[] = ["left", "right", "base"];
type HubCoreTab = "settings" | "widgets";
type CanvasSettingsSection = "appearance" | "general" | "layout" | "canvases";
type WidgetFilter = "all" | "system" | "custom";

const THEME_OPTIONS: { mode: ThemeMode; Icon: typeof Sun }[] = [
  { mode: "light", Icon: Sun },
  { mode: "auto", Icon: SunMoon },
  { mode: "dark", Icon: Moon },
];

const WIDGET_FILTER_OPTIONS: { filter: WidgetFilter; label: string }[] = [
  { filter: "all", label: "all" },
  { filter: "system", label: "system" },
  { filter: "custom", label: "custom" },
];

function registryIds() {
  const ids: string[] = [];
  for (const id of [...DEFAULT_ORDER, ...Object.keys(WIDGETS), ...Object.keys(CUSTOM_WIDGETS)]) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function regionShortLabel(region: SlotRegionId) {
  return REGION_LABELS[region].replace(" grid", "");
}

function matchesWidgetFilter(id: string, filter: WidgetFilter, customIds: Set<string>) {
  if (filter === "all") return true;
  const custom = customIds.has(id);
  return filter === "custom" ? custom : !custom;
}

function widgetEmptyText(filter: WidgetFilter, allText: string, systemText: string, customText: string) {
  if (filter === "system") return systemText;
  if (filter === "custom") return customText;
  return allText;
}

function matchesWidgetSearch(id: string, query: string, meta?: string) {
  if (!query) return true;
  const manifest = getManifest(id);
  const haystack = [id, manifest?.title, meta].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query);
}

export function HubCorePanel() {
  const [activeTab, setActiveTab] = useState<HubCoreTab | null>(null);
  // accordion: only one settings section open at a time
  const [openSection, setOpenSection] = useState<CanvasSettingsSection | null>("appearance");
  const panelRef = useRef<HTMLDivElement>(null);

  const { editMode, startEdit, lockLayout } = useLayout();

  function toggleSettingsSection(section: CanvasSettingsSection) {
    setOpenSection((open) => (open === section ? null : section));
  }

  useEffect(() => {
    if (!activeTab) return;
    function onDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setActiveTab(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveTab(null);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [activeTab]);

  return (
    <div ref={panelRef} className="hub-core hub-core-slot">
      <button
        type="button"
        className={`hub-core-btn edge-btn${editMode ? " active" : ""}`}
        onClick={editMode ? lockLayout : startEdit}
        aria-label={editMode ? "exit edit mode" : "enter edit mode"}
        title={editMode ? "exit edit mode" : "enter edit mode"}
      >
        {editMode ? <Lock size={14} strokeWidth={1.75} /> : <Wrench size={14} strokeWidth={1.75} />}
        <span className="edge-btn-label">{editMode ? "lock" : "edit"}</span>
      </button>
      <button
        type="button"
        className={`hub-core-btn edge-btn${activeTab === "settings" ? " active" : ""}`}
        onClick={() => setActiveTab((tab) => (tab === "settings" ? null : "settings"))}
        aria-label={activeTab === "settings" ? "close avn hub core settings" : "open avn hub core settings"}
        title="avn hub core settings"
      >
        <Settings size={14} strokeWidth={1.75} />
        <span className="edge-btn-label">settings</span>
      </button>
      <button
        type="button"
        className={`hub-core-btn edge-btn${activeTab === "widgets" ? " active" : ""}`}
        onClick={() => setActiveTab((tab) => (tab === "widgets" ? null : "widgets"))}
        aria-label={activeTab === "widgets" ? "close widget manager" : "open widget manager"}
        title="widget manager"
      >
        <LayoutGrid size={14} strokeWidth={1.75} />
        <span className="edge-btn-label">widgets</span>
      </button>

      <div className="hub-core-divider" aria-hidden />
      <CanvasSwitcher />

      <AnimatePresence>
        {activeTab && (
          <motion.div
            className={`hub-core-panel${activeTab === "widgets" ? " hub-core-panel-widgets" : ""}`}
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {activeTab === "settings" ? (
              <>
                <CoreSection
                  title="appearance"
                  open={openSection === "appearance"}
                  onToggle={() => toggleSettingsSection("appearance")}
                >
                  <AppearanceSettings />
                </CoreSection>

                <CoreSection
                  title="general"
                  open={openSection === "general"}
                  onToggle={() => toggleSettingsSection("general")}
                >
                  <GeneralSettings />
                </CoreSection>

                <CoreSection
                  title="layout"
                  open={openSection === "layout"}
                  onToggle={() => toggleSettingsSection("layout")}
                >
                  <DefaultModeSettings />
                </CoreSection>

                <CoreSection
                  title="canvases"
                  open={openSection === "canvases"}
                  onToggle={() => toggleSettingsSection("canvases")}
                >
                  <CanvasesSettings />
                </CoreSection>
              </>
            ) : (
              <WidgetManagerTab />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThemeModeRow() {
  const mode = useSyncExternalStore(subscribeTheme, getThemeMode, getServerThemeMode);
  return (
    <div className="seg-row hub-theme-row">
      {THEME_OPTIONS.map(({ mode: m, Icon }) => (
        <button
          key={m}
          type="button"
          className={`seg-btn${mode === m ? " active" : ""}`}
          onClick={() => setThemeMode(m)}
          aria-pressed={mode === m}
        >
          <Icon size={12} strokeWidth={1.75} />
          {m}
        </button>
      ))}
    </div>
  );
}

function PaletteRow() {
  const palette = useSyncExternalStore(subscribeTheme, getPalette, getServerPalette);
  return (
    <div className="palette-row hub-palette-grid">
      {THEME_PACKS.map((pack) => (
        <button
          key={pack.id}
          type="button"
          className={`palette-btn${palette === pack.id ? " active" : ""}`}
          onClick={() => setPalette(pack.id)}
          title={`${pack.label} palette`}
          aria-pressed={palette === pack.id}
        >
          <span className="palette-swatch" style={{ background: pack.swatch[0] }}>
            <span style={{ background: pack.swatch[1] }} />
            <span style={{ background: pack.swatch[2] }} />
          </span>
          <span className="palette-label">{pack.label}</span>
        </button>
      ))}
    </div>
  );
}

function AppearanceSettings() {
  const { canvases, activeId } = useSyncExternalStore(subscribeCanvases, getCanvases, getServerCanvases);
  const activeName = canvases.find((c) => c.id === activeId)?.name ?? "this canvas";
  return (
    <div className="hub-appearance-panel">
      <div className="hub-setting-stack">
        <span className="hub-setting-label">theme</span>
        <ThemeModeRow />
      </div>
      <div className="hub-setting-stack">
        <span className="hub-setting-label">palette</span>
        <PaletteRow />
      </div>
      {canvases.length > 1 && <div className="hub-core-fixed-note">applies to &ldquo;{activeName}&rdquo; only — each canvas has its own theme</div>}
    </div>
  );
}

function CanvasesSettings() {
  const { canvases, activeId } = useSyncExternalStore(subscribeCanvases, getCanvases, getServerCanvases);

  return (
    <div className="hub-canvases-panel">
      {canvases.map((canvas) => (
        <CanvasSettingsRow key={canvas.id} canvas={canvas} active={canvas.id === activeId} deletable={canvases.length > 1} />
      ))}
      <button
        type="button"
        className="wset-hide-btn"
        onClick={() => createCanvas(`canvas ${canvases.length + 1}`)}
      >
        <Plus size={12} strokeWidth={1.75} />
        add canvas
      </button>
    </div>
  );
}

function CanvasSettingsRow({ canvas, active, deletable }: { canvas: Canvas; active: boolean; deletable: boolean }) {
  const [name, setName] = useState(canvas.name);
  const [pickingIcon, setPickingIcon] = useState(false);

  // stay in sync if this canvas is renamed elsewhere (e.g. the edge pill's
  // own rename flyout) while this row is mounted — adjusted during render
  // (React's documented pattern for deriving state from a changed prop),
  // not in an effect, so it can't cascade an extra render
  const [prevCanvasName, setPrevCanvasName] = useState(canvas.name);
  if (canvas.name !== prevCanvasName) {
    setPrevCanvasName(canvas.name);
    setName(canvas.name);
  }

  function commitName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== canvas.name) renameCanvas(canvas.id, trimmed);
    else setName(canvas.name);
  }

  function handleDelete() {
    if (!deletable) return;
    if (!window.confirm(`Delete canvas "${canvas.name}"? Its layout can't be recovered.`)) return;
    deleteCanvas(canvas.id);
  }

  return (
    <div className="hub-canvas-row">
      <div className="hub-canvas-row-main">
        <button
          type="button"
          className={`hub-canvas-glyph-btn${pickingIcon ? " active" : ""}`}
          onClick={() => setPickingIcon((p) => !p)}
          title="change icon"
          aria-label={`change icon for ${canvas.name}`}
        >
          <CanvasGlyph canvas={canvas} />
        </button>
        <input
          className="canvas-manage-input hub-canvas-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
          }}
          aria-label={`rename ${canvas.name} canvas`}
        />
        {active && <span className="hub-canvas-active-badge">active</span>}
        <button
          type="button"
          className="hub-widget-btn danger"
          disabled={!deletable}
          onClick={handleDelete}
          aria-label={`delete ${canvas.name} canvas`}
          title={deletable ? "delete canvas" : "can't delete the last canvas"}
        >
          <Trash2 size={11} strokeWidth={1.75} />
        </button>
      </div>
      {pickingIcon && <CanvasIconPicker value={canvas.icon} onChange={(icon) => setCanvasIcon(canvas.id, icon)} />}
    </div>
  );
}

function GeneralSettings() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const { resetLayout } = useLayout();

  function resetAll() {
    resetLayout();
    resetSlotLayout();
  }

  return (
    <>
      <label className="wset-row">
        <span>live data polling</span>
        <input
          type="checkbox"
          checked={prefs.pollingEnabled}
          onChange={(e) => setPrefs({ pollingEnabled: e.target.checked })}
        />
      </label>
      <label className="wset-row">
        <span>boot sequence intro</span>
        <input
          type="checkbox"
          checked={prefs.bootSequence}
          onChange={(e) => setPrefs({ bootSequence: e.target.checked })}
        />
      </label>
      <button type="button" className="wset-hide-btn hub-reset" onClick={resetAll}>
        <RotateCcw size={12} strokeWidth={1.75} />
        reset layout & widget config
      </button>
    </>
  );
}

function WidgetManagerTab() {
  const [widgetFilter, setWidgetFilter] = useState<WidgetFilter>("all");
  const [widgetSearch, setWidgetSearch] = useState("");
  const customIds = new Set(Object.keys(CUSTOM_WIDGETS));
  const registeredIds = registryIds().filter((id) => getManifest(id));
  const counts = {
    all: registeredIds.length,
    system: registeredIds.filter((id) => !customIds.has(id)).length,
    custom: registeredIds.filter((id) => customIds.has(id)).length,
  } satisfies Record<WidgetFilter, number>;

  return (
    <div className="hub-core-tab-content">
      <div className="hub-core-tab-head">
        <span className="wset-title">widget manager</span>
      </div>
      <WidgetImportBar />
      <label className="hub-widget-search">
        <Search size={13} strokeWidth={1.75} />
        <input
          type="search"
          value={widgetSearch}
          onChange={(e) => setWidgetSearch(e.target.value)}
          placeholder="search widgets"
          aria-label="search widgets"
        />
      </label>
      <div className="hub-widget-filter-tabs" role="tablist" aria-label="widget category">
        {WIDGET_FILTER_OPTIONS.map(({ filter, label }) => (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={widgetFilter === filter}
            className={`hub-widget-filter-tab${widgetFilter === filter ? " active" : ""}`}
            onClick={() => setWidgetFilter(filter)}
          >
            {label}
            <span>{counts[filter]}</span>
          </button>
        ))}
      </div>
      <div className="hub-widget-scroll" role="region" aria-label="widget manager list">
        <SlotWidgetControls filter={widgetFilter} search={widgetSearch} />
      </div>
    </div>
  );
}

/** import a .zip exported from another card and register the widget it carries.
    On success the file writes trigger HMR and the widget appears in the lists. */
function WidgetImportBar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "ok" | "error"; msg?: string }>({ kind: "idle" });

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    setStatus({ kind: "busy", msg: "importing…" });
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/widget-creator/import", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.ok) setStatus({ kind: "ok", msg: `imported ${data.id ?? ""} ✓` });
      else setStatus({ kind: "error", msg: data.error ?? "import failed" });
    } catch {
      setStatus({ kind: "error", msg: "import failed" });
    }
  }

  return (
    <div className="hub-core-io-row hub-widget-importbar">
      <button
        type="button"
        className="hub-core-io-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={status.kind === "busy"}
        title="import a widget exported as .zip"
      >
        <Upload size={14} strokeWidth={1.75} />
        import widget
      </button>
      {status.kind !== "idle" && status.kind !== "busy" && (
        <span className={status.kind === "ok" ? "hub-core-io-ok" : "hub-core-io-error"}>{status.msg}</span>
      )}
      {status.kind === "busy" && <span className="block-sub">{status.msg}</span>}
      <input ref={fileInputRef} type="file" accept=".zip" style={{ display: "none" }} onChange={handleImport} />
    </div>
  );
}

function CoreSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="hub-core-section">
      <button type="button" className="hub-core-section-head" onClick={onToggle} aria-expanded={open}>
        <span className="wset-title">{title}</span>
        <ChevronDown size={13} strokeWidth={1.75} className={`hub-core-chevron${open ? " open" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="hub-core-section-body"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DefaultModeSettings() {
  const slotLayout = useSyncExternalStore(subscribeSlotLayout, getSlotLayout, getServerSlotLayout);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string);
        const ok = importSlotLayout(raw);
        setImportError(ok ? null : "unrecognised layout file");
      } catch {
        setImportError("invalid json");
      }
      // reset so re-importing the same file fires onChange again
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  }

  return (
    <>
      {REGION_IDS.map((region) => (
        <RegionDimsRow key={region} region={region} dims={slotLayout.regionDims[region]} />
      ))}
      <div className="wset-row">
        <span>nutbot</span>
        <span className="hub-core-fixed-note">1 slot · fixed</span>
      </div>
      <div className="hub-core-io-row">
        <button type="button" className="hub-core-io-btn" onClick={exportSlotLayout} title="download current layout as JSON">
          <Download size={14} strokeWidth={1.75} />
          export
        </button>
        <button type="button" className="hub-core-io-btn" onClick={() => fileInputRef.current?.click()} title="load a previously exported layout JSON">
          <Upload size={14} strokeWidth={1.75} />
          import
        </button>
        <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={handleImport} />
      </div>
      {importError && <div className="hub-core-io-error">{importError}</div>}
    </>
  );
}

function SlotWidgetControls({ filter, search }: { filter: WidgetFilter; search: string }) {
  const slotLayout = useSyncExternalStore(subscribeSlotLayout, getSlotLayout, getServerSlotLayout);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const customIds = new Set(Object.keys(CUSTOM_WIDGETS));
  const query = search.trim().toLowerCase();
  const allPlacedRows = [
    ...slotLayout.widgets.map((w) => ({ id: w.id, location: regionShortLabel(w.region), terminal: false })),
    ...(slotLayout.terminalWidgetId
      ? [{ id: slotLayout.terminalWidgetId, location: "terminal", terminal: true }]
      : []),
  ].filter((row) => getManifest(row.id));
  const placedRows = allPlacedRows.filter(
    (row) => matchesWidgetFilter(row.id, filter, customIds) && matchesWidgetSearch(row.id, query, row.location),
  );
  const placedIds = new Set(allPlacedRows.map((row) => row.id));
  const availableIds = registryIds().filter(
    (id) => !placedIds.has(id) && getManifest(id) && matchesWidgetFilter(id, filter, customIds) && matchesWidgetSearch(id, query),
  );
  const placedEmpty = query
    ? "no placed widgets match search"
    : widgetEmptyText(filter, "no widgets placed", "no system widgets placed", "no custom widgets placed");
  const availableEmpty = query
    ? "no available widgets match search"
    : widgetEmptyText(filter, "all widgets are placed", "all system widgets are placed", "no custom widgets available");

  async function deleteCustomWidget(id: string) {
    if (!customIds.has(id) || deletingId) return;
    setDeletingId(id);
    setDeleteError(null);
    removeSlotWidget(id);
    if (slotLayout.terminalWidgetId === id) setTerminalWidget(null);
    try {
      const res = await fetch("/api/widget-creator/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null) as { error?: string } | null;
        setDeleteError(payload?.error ?? `failed to delete ${id}`);
      }
    } finally {
      setDeletingId(null);
    }
  }

  function addToRegion(id: string, region: SlotRegionId) {
    if (placeWidget(id, region)) setAddingId(null);
  }

  return (
    <div className="hub-widget-panel">
      {deleteError && <div className="hub-core-io-error">{deleteError}</div>}
      <HubWidgetList
        heading={`placed · ${placedRows.length}`}
        ids={placedRows.map((row) => row.id)}
        metaFor={(id) => placedRows.find((row) => row.id === id)?.location}
        empty={placedEmpty}
        actionFor={(id) => (
          <HubWidgetActions
            id={id}
            manifest={getManifest(id)}
            isCustom={customIds.has(id)}
            deleting={deletingId === id}
            onDelete={deleteCustomWidget}
            primaryLabel="remove widget"
            primaryTitle="remove from canvas"
            onPrimary={() => {
              if (slotLayout.terminalWidgetId === id) setTerminalWidget(null);
              else removeSlotWidget(id);
            }}
            primaryIcon={<Minus size={13} strokeWidth={2} />}
          />
        )}
      />
      <HubWidgetList
        heading={`available · ${availableIds.length}`}
        ids={availableIds}
        empty={availableEmpty}
        actionFor={(id) => {
          const fitRegions = getRegionsThatFitWidget(id, slotLayout);
          const open = addingId === id;
          return (
            <div className="hub-widget-add">
              <HubWidgetActions
                id={id}
                manifest={getManifest(id)}
                isCustom={customIds.has(id)}
                deleting={deletingId === id}
                onDelete={deleteCustomWidget}
                primaryLabel="choose where to add widget"
                primaryTitle={fitRegions.length ? "choose region" : "no canvas region has space"}
                onPrimary={() => setAddingId(open ? null : id)}
                primaryIcon={<Plus size={13} strokeWidth={2} />}
                primaryDisabled={fitRegions.length === 0}
              />
              <AnimatePresence initial={false}>
                {open && fitRegions.length > 0 && (
                  <motion.div
                    className="hub-widget-regions"
                    initial={{ opacity: 0, y: -3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.12 }}
                  >
                    {fitRegions.map((region) => (
                      <button
                        key={region}
                        type="button"
                        className="hub-widget-region-btn"
                        onClick={() => addToRegion(id, region)}
                      >
                        {regionShortLabel(region)}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        }}
      />
    </div>
  );
}

function HubWidgetList({
  heading,
  ids,
  actionFor,
  empty,
  metaFor,
}: {
  heading: string;
  ids: string[];
  actionFor: (id: string) => ReactNode;
  empty: string;
  metaFor?: (id: string) => string | undefined;
}) {
  return (
    <div className="hub-widget-list-section">
      <div className="more-head">{heading}</div>
      {ids.length === 0 ? (
        <div className="block-sub">{empty}</div>
      ) : (
        <div className="hub-widget-list">
          {ids.map((id) => {
            const manifest = getManifest(id);
            if (!manifest) return null;
            const Icon = manifest.icon;
            const meta = metaFor?.(id);
            return (
              <div className="hub-widget-item" key={id}>
                <Icon className="hub-widget-icon" size={14} strokeWidth={1.75} />
                <div className="hub-widget-text">
                  <span className="hub-widget-title">{manifest.title}</span>
                  <span className="hub-widget-meta">
                    #{id}
                    {meta && <> · {meta}</>}
                  </span>
                </div>
                {actionFor(id)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HubWidgetActions({
  id,
  manifest,
  isCustom,
  deleting,
  onDelete,
  onPrimary,
  primaryIcon,
  primaryLabel,
  primaryTitle,
  primaryDisabled = false,
}: {
  id: string;
  manifest?: WidgetManifest;
  isCustom: boolean;
  deleting: boolean;
  onDelete: (id: string) => void;
  onPrimary: () => void;
  primaryIcon: ReactNode;
  primaryLabel: string;
  primaryTitle: string;
  primaryDisabled?: boolean;
}) {
  return (
    <div className="hub-widget-actions">
      {isCustom && (
        <button
          type="button"
          className="hub-widget-btn"
          onClick={() => {
            window.location.href = `/api/widget-creator/export?id=${encodeURIComponent(id)}`;
          }}
          aria-label={`export ${manifest?.title ?? id} widget`}
          title="export widget (.zip)"
        >
          <Download size={11} strokeWidth={1.75} />
        </button>
      )}
      {isCustom && (
        <button
          type="button"
          className="hub-widget-btn danger"
          disabled={deleting}
          onClick={() => onDelete(id)}
          aria-label={`delete ${manifest?.title ?? id} widget permanently`}
          title="delete widget permanently"
        >
          <Trash2 size={11} strokeWidth={1.75} />
        </button>
      )}
      <button
        type="button"
        className="hub-widget-btn"
        disabled={primaryDisabled}
        onClick={onPrimary}
        aria-label={`${primaryLabel}: ${manifest?.title ?? id}`}
        title={primaryTitle}
      >
        {primaryIcon}
      </button>
    </div>
  );
}

function Stepper({ label, value, onStep }: { label: string; value: number; onStep: (delta: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0" }}>
      <span className="hub-region-label">{label}</span>
      <div className="hub-stepper">
        <button type="button" className="hub-stepper-btn" onClick={() => onStep(-1)} aria-label={`decrease ${label}`}>
          <Minus size={9} strokeWidth={2.5} />
        </button>
        <span className="hub-stepper-val">{value}</span>
        <button type="button" className="hub-stepper-btn" onClick={() => onStep(1)} aria-label={`increase ${label}`}>
          <Plus size={9} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

function RegionDimsRow({ region, dims }: { region: SlotRegionId; dims: RegionDims }) {
  function step(key: "rows" | "cols", delta: number) {
    const { minRows, maxRows, minCols, maxCols } = REGION_DIMS_BOUNDS;
    const min = key === "rows" ? minRows : minCols;
    const max = key === "rows" ? maxRows : maxCols;
    const next = Math.min(max, Math.max(min, dims[key] + delta));
    if (next !== dims[key]) setRegionDims(region, { ...dims, [key]: next });
  }

  return (
    <div className="hub-region-card">
      <div className="hub-region-head">{REGION_LABELS[region]}</div>
      <Stepper label="rows" value={dims.rows} onStep={(d) => step("rows", d)} />
      <Stepper label="cols" value={dims.cols} onStep={(d) => step("cols", d)} />
    </div>
  );
}

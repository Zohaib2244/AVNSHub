"use client";

// AVN Hub Core Settings — a fixed top-right area with tab controls:
// 1. A persistent edit-mode toggle (wrench/lock) — always visible, one click.
// 2. A settings gear that opens layout mode + mode-specific config.
// 3. A widget manager tab that opens add/remove controls.

import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Download, LayoutGrid, Lock, Minus, Plus, RotateCcw, Settings, Trash2, Upload, Wrench } from "lucide-react";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { CUSTOM_WIDGETS } from "@/config/customWidgets";
import { DEFAULT_ORDER, WIDGETS, getManifest, type WidgetManifest } from "@/config/widgets";
import {
  getLayoutMode,
  getServerLayoutMode,
  setLayoutMode,
  subscribeLayoutMode,
  type LayoutMode,
} from "@/lib/layoutMode";
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

const LAYOUT_MODE_OPTIONS: { mode: LayoutMode; label: string }[] = [
  { mode: "graph", label: "graph" },
  { mode: "slots", label: "default" },
];

const REGION_IDS: SlotRegionId[] = ["left", "right", "base"];
type HubCoreTab = "settings" | "widgets";

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

export function HubCorePanel({ slotMode = false }: { slotMode?: boolean }) {
  const [activeTab, setActiveTab] = useState<HubCoreTab | null>(null);
  const [avnOpen, setAvnOpen] = useState(true);
  const [modeOpen, setModeOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const { editMode, startEdit, lockLayout, resetLayout } = useLayout();
  const layoutMode = useSyncExternalStore(subscribeLayoutMode, getLayoutMode, getServerLayoutMode);

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

  function resetCurrentLayout() {
    if (layoutMode === "slots") resetSlotLayout();
    else resetLayout();
  }

  return (
    <div ref={panelRef} className={`hub-core${slotMode ? " hub-core-slot" : ""}`}>
      <button
        type="button"
        className={`hub-core-btn${editMode ? " active" : ""}`}
        onClick={editMode ? lockLayout : startEdit}
        aria-label={editMode ? "exit edit mode" : "enter edit mode"}
        title={editMode ? "exit edit mode" : "enter edit mode"}
      >
        {editMode ? <Lock size={14} strokeWidth={1.75} /> : <Wrench size={14} strokeWidth={1.75} />}
      </button>
      <button
        type="button"
        className={`hub-core-btn${activeTab === "settings" ? " active" : ""}`}
        onClick={() => setActiveTab((tab) => (tab === "settings" ? null : "settings"))}
        aria-label={activeTab === "settings" ? "close avn hub core settings" : "open avn hub core settings"}
        title="avn hub core settings"
      >
        <Settings size={14} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className={`hub-core-btn${activeTab === "widgets" ? " active" : ""}`}
        onClick={() => setActiveTab((tab) => (tab === "widgets" ? null : "widgets"))}
        aria-label={activeTab === "widgets" ? "close widget manager" : "open widget manager"}
        title="widget manager"
      >
        <LayoutGrid size={14} strokeWidth={1.75} />
      </button>

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
                <CoreSection title="avn hub" open={avnOpen} onToggle={() => setAvnOpen((o) => !o)}>
                  <div className="wset-row">
                    <span>edit mode</span>
                    <div className="seg-row">
                      <button type="button" className={`seg-btn${!editMode ? " active" : ""}`} onClick={lockLayout}>
                        <Lock size={14} strokeWidth={1.75} />
                        locked
                      </button>
                      <button type="button" className={`seg-btn${editMode ? " active" : ""}`} onClick={startEdit}>
                        <Wrench size={14} strokeWidth={1.75} />
                        editing
                      </button>
                    </div>
                  </div>
                  <div className="wset-row">
                    <span>layout</span>
                    <div className="seg-row">
                      {LAYOUT_MODE_OPTIONS.map(({ mode, label }) => (
                        <button
                          key={mode}
                          type="button"
                          className={`seg-btn${layoutMode === mode ? " active" : ""}`}
                          onClick={() => setLayoutMode(mode)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editMode && (
                    <button type="button" className="wset-hide-btn hub-reset" onClick={resetCurrentLayout}>
                      <RotateCcw size={12} strokeWidth={1.75} />
                      reset {layoutMode === "slots" ? "default" : "graph"} layout
                    </button>
                  )}
                </CoreSection>

                <CoreSection
                  title={layoutMode === "slots" ? "default mode" : "graph mode"}
                  open={modeOpen}
                  onToggle={() => setModeOpen((o) => !o)}
                >
                  {layoutMode === "slots" ? <DefaultModeSettings /> : <GraphModeSettings />}
                </CoreSection>
              </>
            ) : (
              <WidgetManagerTab layoutMode={layoutMode} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WidgetManagerTab({ layoutMode }: { layoutMode: LayoutMode }) {
  return (
    <div className="hub-core-tab-content">
      <div className="hub-core-tab-head">
        <span className="wset-title">widget manager</span>
        <span className="hub-core-tab-meta">{layoutMode === "slots" ? "default layout" : "graph layout"}</span>
      </div>
      {layoutMode === "slots" ? <SlotWidgetControls /> : <GraphWidgetControls />}
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

function SlotWidgetControls() {
  const slotLayout = useSyncExternalStore(subscribeSlotLayout, getSlotLayout, getServerSlotLayout);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const customIds = new Set(Object.keys(CUSTOM_WIDGETS));
  const placedRows = [
    ...slotLayout.widgets.map((w) => ({ id: w.id, location: regionShortLabel(w.region), terminal: false })),
    ...(slotLayout.terminalWidgetId
      ? [{ id: slotLayout.terminalWidgetId, location: "terminal", terminal: true }]
      : []),
  ].filter((row) => getManifest(row.id));
  const placedIds = new Set(placedRows.map((row) => row.id));
  const availableIds = registryIds().filter((id) => !placedIds.has(id) && getManifest(id));

  async function deleteCustomWidget(id: string) {
    if (!customIds.has(id) || deletingId) return;
    setDeletingId(id);
    removeSlotWidget(id);
    if (slotLayout.terminalWidgetId === id) setTerminalWidget(null);
    try {
      await fetch("/api/widget-creator/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } finally {
      setDeletingId(null);
    }
  }

  function addToRegion(id: string, region: SlotRegionId) {
    if (placeWidget(id, region)) setAddingId(null);
  }

  return (
    <div className="hub-widget-panel">
      <HubWidgetList
        heading={`placed · ${placedRows.length}`}
        ids={placedRows.map((row) => row.id)}
        metaFor={(id) => placedRows.find((row) => row.id === id)?.location}
        empty="no widgets placed"
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
        empty="all widgets are placed"
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

function GraphWidgetControls() {
  const { layout, updateInstance, addWidget } = useLayout();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const customIds = new Set(Object.keys(CUSTOM_WIDGETS));
  const byId = new Map(layout.widgets.map((w) => [w.id, w]));
  const tracked = registryIds().filter((id) => byId.has(id));
  const untracked = registryIds().filter((id) => !byId.has(id));
  const onScreen = tracked.filter((id) => !byId.get(id)!.hidden);
  const available = [...tracked.filter((id) => byId.get(id)!.hidden), ...untracked].filter((id) => getManifest(id));

  async function deleteCustomWidget(id: string) {
    if (!customIds.has(id) || deletingId) return;
    setDeletingId(id);
    if (byId.has(id)) updateInstance(id, { hidden: true });
    try {
      await fetch("/api/widget-creator/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="hub-widget-panel">
      <HubWidgetList
        heading={`on screen · ${onScreen.length}`}
        ids={onScreen}
        empty="no widgets visible"
        actionFor={(id) => (
          <HubWidgetActions
            id={id}
            manifest={getManifest(id)}
            isCustom={customIds.has(id)}
            deleting={deletingId === id}
            onDelete={deleteCustomWidget}
            primaryLabel="hide widget"
            primaryTitle="hide widget"
            onPrimary={() => updateInstance(id, { hidden: true })}
            primaryIcon={<Minus size={13} strokeWidth={2} />}
          />
        )}
      />
      <HubWidgetList
        heading={`available · ${available.length}`}
        ids={available}
        empty="every widget is on screen"
        actionFor={(id) => (
          <HubWidgetActions
            id={id}
            manifest={getManifest(id)}
            isCustom={customIds.has(id)}
            deleting={deletingId === id}
            onDelete={deleteCustomWidget}
            primaryLabel="show widget"
            primaryTitle="show widget"
            onPrimary={() => (byId.has(id) ? updateInstance(id, { hidden: false }) : addWidget(id))}
            primaryIcon={<Plus size={13} strokeWidth={2} />}
          />
        )}
      />
    </div>
  );
}

function GraphModeSettings() {
  return (
    <div className="hub-core-placeholder">
      no graph-mode settings yet — widget size and orientation are configured per-widget via each card&rsquo;s gear menu.
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

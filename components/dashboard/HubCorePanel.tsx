"use client";

// AVN Hub Core Settings — a fixed top-right area with two controls:
// 1. A persistent edit-mode toggle (wrench/lock) — always visible, one click.
// 2. A settings gear that opens a panel for layout mode + mode-specific config.
// The panel has two independently-collapsible sections: "avn hub" and
// "default mode" / "graph mode" (content depends on the active layout mode).

import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ChevronDown, Download, Lock, RotateCcw, Settings, Upload, Wrench, X } from "lucide-react";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import {
  getLayoutMode,
  getServerLayoutMode,
  setLayoutMode,
  subscribeLayoutMode,
  type LayoutMode,
} from "@/lib/layoutMode";
import { exportSlotLayout, getSlotLayout, getServerSlotLayout, importSlotLayout, resetSlotLayout, setRegionDims, subscribeSlotLayout } from "@/lib/slotLayout";
import { REGION_DIMS_BOUNDS, REGION_LABELS, type RegionDims, type SlotRegionId } from "@/config/slotLayout";

const LAYOUT_MODE_OPTIONS: { mode: LayoutMode; label: string }[] = [
  { mode: "graph", label: "graph" },
  { mode: "slots", label: "default" },
];

const REGION_IDS: SlotRegionId[] = ["left", "right", "base"];

export function HubCorePanel() {
  const [open, setOpen] = useState(false);
  const [avnOpen, setAvnOpen] = useState(true);
  const [modeOpen, setModeOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const { editMode, startEdit, lockLayout, resetLayout } = useLayout();
  const layoutMode = useSyncExternalStore(subscribeLayoutMode, getLayoutMode, getServerLayoutMode);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function resetCurrentLayout() {
    if (layoutMode === "slots") resetSlotLayout();
    else resetLayout();
  }

  return (
    <div ref={panelRef} className="hub-core">
      <button
        type="button"
        className={`theme-toggle${editMode ? " edit-active" : ""}`}
        onClick={editMode ? lockLayout : startEdit}
        aria-label={editMode ? "exit edit mode" : "enter edit mode"}
        title={editMode ? "exit edit mode" : "enter edit mode"}
      >
        {editMode ? <Lock size={12} strokeWidth={1.75} /> : <Wrench size={12} strokeWidth={1.75} />}
      </button>
      <button
        type="button"
        className={`theme-toggle hub-core-trigger${open ? " edit-active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "close avn hub core settings" : "open avn hub core settings"}
        title="avn hub core settings"
      >
        {open ? <X size={12} strokeWidth={1.75} /> : <Settings size={12} strokeWidth={1.75} />}
      </button>

      {open && (
        <div className="hub-core-panel">
          <CoreSection title="avn hub" open={avnOpen} onToggle={() => setAvnOpen((o) => !o)}>
            <div className="wset-row">
              <span>edit mode</span>
              <div className="seg-row">
                <button type="button" className={`seg-btn${!editMode ? " active" : ""}`} onClick={lockLayout}>
                  <Lock size={11} strokeWidth={1.75} />
                  locked
                </button>
                <button type="button" className={`seg-btn${editMode ? " active" : ""}`} onClick={startEdit}>
                  <Wrench size={11} strokeWidth={1.75} />
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
        </div>
      )}
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
      {open && <div className="hub-core-section-body">{children}</div>}
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
          <Download size={11} strokeWidth={1.75} />
          export
        </button>
        <button type="button" className="hub-core-io-btn" onClick={() => fileInputRef.current?.click()} title="load a previously exported layout JSON">
          <Upload size={11} strokeWidth={1.75} />
          import
        </button>
        <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={handleImport} />
      </div>
      {importError && <div className="hub-core-io-error">{importError}</div>}
    </>
  );
}

function RegionDimsRow({ region, dims }: { region: SlotRegionId; dims: RegionDims }) {
  const [cols, setCols] = useState(String(dims.cols));
  const [rows, setRows] = useState(String(dims.rows));

  useEffect(() => {
    setCols(String(dims.cols));
    setRows(String(dims.rows));
  }, [dims.cols, dims.rows]);

  function commit() {
    const next = { cols: Number(cols), rows: Number(rows) };
    if (!Number.isFinite(next.cols) || !Number.isFinite(next.rows)) {
      setCols(String(dims.cols));
      setRows(String(dims.rows));
      return;
    }
    setRegionDims(region, next);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
  }

  return (
    <div className="wset-row">
      <span>{REGION_LABELS[region]}</span>
      <div className="hub-core-dims">
        <input
          type="number"
          className="wset-input dims-input"
          min={REGION_DIMS_BOUNDS.minRows}
          max={REGION_DIMS_BOUNDS.maxRows}
          value={rows}
          onChange={(e) => setRows(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          aria-label={`${REGION_LABELS[region]} rows`}
        />
        <span className="hub-core-dims-sep">×</span>
        <input
          type="number"
          className="wset-input dims-input"
          min={REGION_DIMS_BOUNDS.minCols}
          max={REGION_DIMS_BOUNDS.maxCols}
          value={cols}
          onChange={(e) => setCols(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          aria-label={`${REGION_LABELS[region]} columns`}
        />
      </div>
    </div>
  );
}

function GraphModeSettings() {
  return (
    <div className="hub-core-placeholder">
      no graph-mode settings yet — widget size, orientation, and visibility are configured per-widget via each
      card&rsquo;s gear menu.
    </div>
  );
}

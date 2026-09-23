"use client";

// AVN Hub Core — the control deck. One horizontal sticker bar centred on the
// bottom of the CANVAS (not the window), holding everything global: the
// canvas switcher, a two-state view/edit switch, canvas settings, the widget
// manager and the snapshot button. It replaces the old right-edge tab column.
//
// It auto-hides. At rest it is a stub — three dots straddling the frame's
// bottom border, one per canvas with the active one lit — so Hub Core costs
// no canvas at all until you reach for it; approach, click or focus expands
// the stub into the whole bar. Timings and the pinning rules that stop it
// vanishing mid-task live in lib/useDeckAutoHide.ts. Panels open UPWARD out
// of the bar, so the canvas you are changing stays visible while you change
// it. Prototype this came from: public/proto/control-deck.html.

import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Camera,
  Check,
  Download,
  Droplets,
  EyeOff,
  Ghost,
  IdCard,
  ImageOff,
  ImagePlus,
  LayoutGrid,
  Lock,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Square,
  Sun,
  SunMoon,
  Tag,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react";
import { getHeaderStyle, getServerHeaderStyle, setHeaderStyle, subscribeHeaderStyle } from "@/lib/headerStyle";
import { type HeaderStyle } from "@/config/widgets";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { useDeckAutoHide } from "@/lib/useDeckAutoHide";
import { snapshotCanvas } from "@/lib/snapshotCanvas";
import { SETTINGS_SECTIONS } from "@/config/hubSettings";
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
  clearWallpaper,
  getBackdropMode,
  getParallax,
  getServerBackdropMode,
  getServerParallax,
  getServerWallpaperKind,
  getServerWallpaperUrl,
  getServerWidgetBackdropMode,
  getWallpaperKind,
  getWallpaperUrl,
  getWidgetBackdropMode,
  setBackdropMode,
  setParallax,
  setWallpaper,
  setWidgetBackdropMode,
  subscribeWallpaper,
  type BackdropMode,
} from "@/lib/wallpaper";
import {
  exportSlotLayout,
  getRegionsThatFitWidget,
  getSlotLayout,
  getServerSlotLayout,
  importSlotLayout,
  placeWidget,
  placeWidgetAuto,
  removeWidget as removeSlotWidget,
  resetSlotLayout,
  setRegionDims,
  subscribeSlotLayout,
} from "@/lib/slotLayout";
import { REGION_DIMS_BOUNDS, REGION_GRID, REGION_LABELS, type RegionDims, type SlotRegionId } from "@/config/slotLayout";
import { syncDeletedWidget } from "@/lib/widget-creator/projectStore";

const REGION_IDS = Object.keys(REGION_GRID) as SlotRegionId[];
// Settings used to be one accordion column: four headers plus whichever body
// was open, all stacked in a 250px-wide panel, with "appearance" alone
// carrying six unrelated groups. Same controls, split by what they act on and
// reached from a rail instead — one section is visible at a time, so the
// panel is never a single long menu you have to read to the end of. The
// section list lives in config/hubSettings.ts; the selected section lives in
// LayoutProvider so the command palette can open straight to one.
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

/** Animates its own height to follow its content, so the settings panel
    grows and shrinks smoothly between sections instead of snapping to the new
    size. The content is measured with a ResizeObserver and `height` itself is
    tweened — deliberately not framer's `layout` prop, which animates size
    with a scale transform and visibly squashes the text mid-resize. The
    observer also catches size changes inside one section (an icon picker
    opening, a wallpaper being added), so those ease too.

    What it measures is the VISIBLE height: `innerClassName` is the panel's
    capped scroller, so the measurement already includes the section rail's
    floor and the max-height ceiling. Measuring the raw section content
    instead tweened through a range the panel mostly clamped away (e.g.
    206→489px for a visible 254→430px), so the part you could see went by in
    a frame or two and still read as a snap. */
function AutoHeight({ children, innerClassName }: { children: ReactNode; innerClassName?: string }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      className="hub-autoheight"
      initial={false}
      animate={{ height }}
      // ease-in-out rather than ease-out: a strong ease-out spends most of
      // its distance in the first few frames, which is exactly the snap
      transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
    >
      <div ref={innerRef} className={innerClassName}>
        {children}
      </div>
    </motion.div>
  );
}

/** label the palette key cap for the platform actually in use. Read through
    useSyncExternalStore with a `false` server snapshot, so the server render
    and the first client render agree and a Mac doesn't hydrate-mismatch. */
function isMacLike() {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}
const noopSubscribe = () => () => {};

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
  // accordion: only one settings section open at a time
  const panelRef = useRef<HTMLDivElement>(null);
  const [snapState, setSnapState] = useState<"idle" | "busy" | "done">("idle");

  const {
    editMode,
    startEdit,
    lockLayout,
    hubCoreTab: activeTab,
    setHubCoreTab: setActiveTab,
    activePopover,
    settingsSection: openSection,
    setSettingsSection: setOpenSection,
    paletteOpen,
    setPaletteOpen,
  } = useLayout();

  // the deck stays out while a tab is open, while the layout is being
  // rearranged, or while a popover it owns (the canvas rename/create flyout)
  // is up — it must never disappear mid-task
  const deckPinned = activeTab !== null || editMode || activePopover !== null;
  const { open: deckOpen, show: showDeck, hide: hideDeck, peek: peekDeck } = useDeckAutoHide(panelRef, deckPinned);
  const macLike = useSyncExternalStore(noopSubscribe, isMacLike, () => false);

  const activeCanvasId = useSyncExternalStore(
    subscribeCanvases,
    () => getCanvases().activeId,
    () => getServerCanvases().activeId,
  );
  const canvasCount = useSyncExternalStore(
    subscribeCanvases,
    () => getCanvases().canvases.length,
    () => getServerCanvases().canvases.length,
  );
  const activeCanvasIndex = useSyncExternalStore(
    subscribeCanvases,
    () => getCanvases().canvases.findIndex((c) => c.id === getCanvases().activeId),
    () => 0,
  );

  // a canvas switched from anywhere else (the widget creator, a dialog)
  // still shows its result: the deck peeks so the dots can be seen moving
  const firstCanvasRender = useRef(true);
  useEffect(() => {
    if (firstCanvasRender.current) {
      firstCanvasRender.current = false;
      return;
    }
    peekDeck();
  }, [activeCanvasId, peekDeck]);

  async function handleSnapshot() {
    if (snapState !== "idle") return;
    setSnapState("busy");
    if (await snapshotCanvas()) {
      setSnapState("done");
      window.setTimeout(() => setSnapState("idle"), 2000);
    } else {
      setSnapState("idle");
    }
  }

  function renderSettingsSection() {
    switch (openSection) {
      case "theme":
        return <ThemeSettings />;
      case "canvas":
        return <CanvasBackdropSettings />;
      case "widgets":
        return <WidgetStyleSettings />;
      case "layout":
        return <LayoutSettings />;
      case "canvases":
        return <CanvasesSettings />;
      case "system":
        return <SystemSettings />;
    }
  }

  useEffect(() => {
    if (!activeTab) return;
    // .hub-core-deck is a transparent anchor layer over the whole frame, so
    // `contains` would count every canvas click as inside it — test the
    // actual controls instead
    function onDown(e: PointerEvent) {
      const el = e.target as Element | null;
      if (!el?.closest(".hub-core-bar, .hub-core-panel, .hub-core-stub")) setActiveTab(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !paletteOpen) setActiveTab(null);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [activeTab, setActiveTab, paletteOpen]);

  // Escape with nothing open puts the deck itself away — one key walks back
  // out of Hub Core entirely (panel first, then the deck)
  useEffect(() => {
    if (!deckOpen || activeTab || paletteOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") hideDeck(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deckOpen, activeTab, paletteOpen, hideDeck]);

  // the stub's dots are one per canvas with the active one lit, so a put-away
  // deck still reports where you are. Past five they would be slivers, so it
  // falls back to three plain dots.
  const stubDots = canvasCount > 5 ? [-1, -1, -1] : Array.from({ length: Math.max(canvasCount, 1) }, (_, i) => i);

  return (
    <div
      ref={panelRef}
      className={`hub-core hub-core-deck${deckOpen ? " deck-open" : ""}`}
      data-edit={editMode ? "true" : undefined}
    >
      <button
        type="button"
        className="hub-core-stub"
        aria-expanded={deckOpen}
        aria-label="show hub core controls"
        title="hub core — click, or move to the bottom edge of the canvas"
        onPointerEnter={showDeck}
        onClick={showDeck}
      >
        {stubDots.map((canvasIndex, i) => (
          <span
            key={i}
            className={`hub-core-stub-dot${canvasIndex === activeCanvasIndex ? " active" : ""}`}
            aria-hidden
          />
        ))}
      </button>

      <div className="hub-core-bar" onPointerLeave={() => hideDeck()}>
        <CanvasSwitcher />

        <div className="hub-core-divider" aria-hidden />

        {/* one control, two legible states — a wrench alone reads as "locked?" */}
        <button
          type="button"
          className="deck-switch"
          onClick={editMode ? lockLayout : startEdit}
          aria-label={editMode ? "exit edit mode" : "enter edit mode"}
          aria-pressed={editMode}
          title={editMode ? "exit edit mode" : "enter edit mode"}
        >
          <span className="deck-switch-knob" aria-hidden />
          {/* named rather than positional: the knob is the switch's first
              <span>, so :first-of-type never matched the "view" label */}
          <span className="deck-switch-state" data-state="view">
            <Lock size={12} strokeWidth={1.75} />
            view
          </span>
          <span className="deck-switch-state" data-state="edit">
            <Wrench size={12} strokeWidth={1.75} />
            edit
          </span>
        </button>

        <div className="hub-core-divider" aria-hidden />

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
        <button
          type="button"
          className={`hub-core-btn edge-btn icon-only${snapState === "done" ? " active" : ""}`}
          onClick={handleSnapshot}
          disabled={snapState === "busy"}
          aria-label="copy canvas snapshot to clipboard"
          title={snapState === "done" ? "copied" : "snapshot canvas"}
        >
          {snapState === "done" ? <Check size={14} strokeWidth={1.75} /> : <Camera size={14} strokeWidth={1.75} />}
        </button>

        <div className="hub-core-divider deck-kbd-divider" aria-hidden />

        {/* the palette reaches everything on this bar and more — the key cap
            is the button, so the shortcut is learnt by looking at it */}
        <button
          type="button"
          className={`hub-core-btn edge-btn deck-kbd-btn${paletteOpen ? " active" : ""}`}
          onClick={() => setPaletteOpen(true)}
          aria-label="open command palette"
          title="command palette"
        >
          <kbd className="deck-kbd">{macLike ? "⌘K" : "ctrl k"}</kbd>
        </button>
      </div>

      <AnimatePresence>
        {activeTab && (
          <motion.div
            className={`hub-core-panel${activeTab === "widgets" ? " hub-core-panel-widgets" : " hub-core-panel-settings"}`}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {activeTab === "settings" ? (
              <AutoHeight innerClassName="hub-settings-scroll">
                <div className="hub-settings-split">
                  <div className="hub-settings-rail" role="tablist" aria-orientation="vertical">
                    {SETTINGS_SECTIONS.map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        role="tab"
                        aria-selected={openSection === section.id}
                        className={`hub-settings-rail-btn${openSection === section.id ? " active" : ""}`}
                        onClick={() => setOpenSection(section.id)}
                      >
                        {section.label}
                      </button>
                    ))}
                  </div>
                  <div className="hub-settings-body" role="tabpanel">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={openSection}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.13, ease: "easeOut" }}
                      >
                        {renderSettingsSection()}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </AutoHeight>
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

const BACKDROP_OPTIONS: { mode: BackdropMode; Icon: typeof Square; label: string }[] = [
  { mode: "solid", Icon: Square, label: "solid" },
  { mode: "blur", Icon: Droplets, label: "blur" },
  { mode: "transparent", Icon: Ghost, label: "transparent" },
  { mode: "glass", Icon: Sparkles, label: "glass" },
];

function BackdropModeRow({
  getMode,
  getServerMode,
  setMode,
}: {
  getMode: () => BackdropMode;
  getServerMode: () => BackdropMode;
  setMode: (mode: BackdropMode) => void;
}) {
  const mode = useSyncExternalStore(subscribeWallpaper, getMode, getServerMode);
  return (
    <div className="seg-row hub-theme-row">
      {BACKDROP_OPTIONS.map(({ mode: m, Icon, label }) => (
        <button
          key={m}
          type="button"
          className={`seg-btn${mode === m ? " active" : ""}`}
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
        >
          <Icon size={12} strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </div>
  );
}

const HEADER_STYLE_OPTIONS: { style: HeaderStyle; Icon: typeof Square; label: string }[] = [
  { style: "ghost", Icon: EyeOff, label: "ghost" },
  { style: "stamp", Icon: Tag, label: "stamp" },
  { style: "crest", Icon: IdCard, label: "crest" },
];

/** canvas-wide default for widget name & icon — the value every widget left on
    "auto" inherits (each can still override it in its own gear popover) */
function HeaderStyleRow({ canvasId }: { canvasId: string }) {
  const style = useSyncExternalStore(
    subscribeHeaderStyle,
    () => getHeaderStyle(canvasId),
    getServerHeaderStyle,
  );
  return (
    <div className="seg-row hub-theme-row">
      {HEADER_STYLE_OPTIONS.map(({ style: s, Icon, label }) => (
        <button
          key={s}
          type="button"
          className={`seg-btn${style === s ? " active" : ""}`}
          onClick={() => setHeaderStyle(canvasId, s)}
          aria-pressed={style === s}
        >
          <Icon size={12} strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </div>
  );
}

function WallpaperPicker({ canvasId }: { canvasId: string }) {
  const url = useSyncExternalStore(subscribeWallpaper, () => getWallpaperUrl(canvasId), getServerWallpaperUrl);
  const kind = useSyncExternalStore(subscribeWallpaper, () => getWallpaperKind(canvasId), getServerWallpaperKind);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && (file.type.startsWith("image/") || file.type.startsWith("video/"))) void setWallpaper(canvasId, file);
  }

  return (
    <div className="wallpaper-picker">
      {url ? (
        <div className="wallpaper-preview">
          {kind === "video" ? (
            <video src={url} className="wallpaper-thumb" autoPlay loop muted playsInline />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="canvas wallpaper" className="wallpaper-thumb" />
          )}
          <button
            type="button"
            className="wallpaper-clear"
            onClick={() => void clearWallpaper(canvasId)}
            aria-label="remove wallpaper"
          >
            <ImageOff size={11} strokeWidth={1.75} />
          </button>
        </div>
      ) : (
        <div
          className={`wallpaper-drop${dragging ? " dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <ImagePlus size={12} strokeWidth={1.75} />
          <span>browse or drop an image/video</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

function ParallaxToggle({ canvasId }: { canvasId: string }) {
  const enabled = useSyncExternalStore(subscribeWallpaper, () => getParallax(canvasId), getServerParallax);
  return (
    <label className="wset-row">
      <span>mouse parallax</span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setParallax(canvasId, e.target.checked)}
      />
    </label>
  );
}

/* theme — what the whole hub is coloured with */
function ThemeSettings() {
  return (
    <div className="hub-appearance-panel">
      <div className="hub-setting-stack">
        <span className="hub-setting-label">mode</span>
        <ThemeModeRow />
      </div>
      <div className="hub-setting-stack">
        <span className="hub-setting-label">palette</span>
        <PaletteRow />
      </div>
    </div>
  );
}

/* canvas — the surface the widgets sit on: its wallpaper and its own backdrop */
function CanvasBackdropSettings() {
  const { activeId } = useSyncExternalStore(subscribeCanvases, getCanvases, getServerCanvases);
  return (
    <div className="hub-appearance-panel">
      <div className="hub-setting-stack">
        <span className="hub-setting-label">wallpaper</span>
        <WallpaperPicker canvasId={activeId} />
        <ParallaxToggle canvasId={activeId} />
      </div>
      <div className="hub-setting-stack">
        <span className="hub-setting-label">canvas backdrop</span>
        <BackdropModeRow
          getMode={() => getBackdropMode(activeId)}
          getServerMode={getServerBackdropMode}
          setMode={(mode) => setBackdropMode(activeId, mode)}
        />
      </div>
    </div>
  );
}

/* widget style — the per-card defaults every widget inherits. Separate from
   `canvas` because the two backdrop dials are independent (the widget one is
   a global default, it does not cascade from the canvas one) and sitting them
   next to each other under one "appearance" heading read as if it did. */
function WidgetStyleSettings() {
  const { activeId } = useSyncExternalStore(subscribeCanvases, getCanvases, getServerCanvases);
  return (
    <div className="hub-appearance-panel">
      <div className="hub-setting-stack">
        <span className="hub-setting-label">widget backdrop</span>
        <BackdropModeRow
          getMode={() => getWidgetBackdropMode(activeId)}
          getServerMode={getServerWidgetBackdropMode}
          setMode={(mode) => setWidgetBackdropMode(activeId, mode)}
        />
      </div>
      <div className="hub-setting-stack">
        <span className="hub-setting-label">widget name &amp; icon</span>
        <HeaderStyleRow canvasId={activeId} />
      </div>
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

/* system — hub-wide behaviour, nothing to do with how the canvas looks */
function SystemSettings() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);

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
      <label className="wset-row">
        <span>boot chime</span>
        <input
          type="checkbox"
          checked={prefs.bootChime}
          onChange={(e) => setPrefs({ bootChime: e.target.checked })}
        />
      </label>
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
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
        updated?: boolean;
        note?: string;
        imported?: string[];
        failed?: { id: string; error?: string }[];
      };
      if (res.ok && data.imported) {
        // a multi-widget bundle: some may have failed on their own
        const failed = data.failed ?? [];
        const msg = `imported ${data.imported.length} widget${data.imported.length === 1 ? "" : "s"} ✓${
          failed.length ? ` · ${failed.length} failed: ${failed.map((f) => f.id).join(", ")}` : ""
        }${data.note ? ` (${data.note})` : ""}`;
        setStatus({ kind: failed.length ? "error" : "ok", msg });
      } else if (res.ok) {
        const verb = data.updated ? "updated" : "imported";
        setStatus({ kind: "ok", msg: `${verb} ${data.id ?? ""} ✓${data.note ? ` (${data.note})` : ""}` });
      }
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

/* layout — region sizes, plus the two things that replace a layout wholesale
   (import, and reset). The reset lived under "general", a section away from
   the layout it throws out. */
function LayoutSettings() {
  const slotLayout = useSyncExternalStore(subscribeSlotLayout, getSlotLayout, getServerSlotLayout);
  const { resetLayout } = useLayout();
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetAll() {
    resetLayout();
    resetSlotLayout();
  }

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
      <button type="button" className="wset-hide-btn hub-reset" onClick={resetAll}>
        <RotateCcw size={12} strokeWidth={1.75} />
        reset layout & widget config
      </button>
    </>
  );
}

function SlotWidgetControls({ filter, search }: { filter: WidgetFilter; search: string }) {
  const slotLayout = useSyncExternalStore(subscribeSlotLayout, getSlotLayout, getServerSlotLayout);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // bulk selection — see BulkBar below for why it exists
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const customIds = new Set(Object.keys(CUSTOM_WIDGETS));
  const query = search.trim().toLowerCase();
  const allPlacedRows = slotLayout.widgets
    .map((w) => ({ id: w.id, location: regionShortLabel(w.region) }))
    .filter((row) => getManifest(row.id));
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

  // only ever act on widgets that still exist and are currently listed
  const visibleIds = [...placedRows.map((row) => row.id), ...availableIds];
  const selectedIds = selected.filter((id) => getManifest(id));
  const selectedSet = new Set(selectedIds);
  const selectedPlaced = selectedIds.filter((id) => placedIds.has(id));
  const selectedUnplaced = selectedIds.filter((id) => !placedIds.has(id));
  const selectedCustom = selectedIds.filter((id) => customIds.has(id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  function toggleSelected(id: string) {
    setBulkNote(null);
    setConfirmDelete(false);
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected([]);
    setBulkNote(null);
    setConfirmDelete(false);
  }

  async function deleteWidgets(ids: string[]) {
    // One request for the whole set: a single registry write, which open
    // pages hot-update in place — no reload (see the delete route).
    const res = await fetch("/api/widget-creator/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids.length === 1 ? { id: ids[0] } : { ids }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      return payload?.error ?? `failed to delete ${ids.join(", ")}`;
    }
    // fully remove the matching creator projects (chat/brief history and all)
    // so none lingers pointing at a widget that no longer exists
    for (const id of ids) syncDeletedWidget(id);
    return null;
  }

  async function deleteCustomWidget(id: string) {
    if (!customIds.has(id) || deletingId) return;
    setDeletingId(id);
    setDeleteError(null);
    removeSlotWidget(id);
    try {
      setDeleteError(await deleteWidgets([id]));
    } finally {
      setDeletingId(null);
    }
  }

  function bulkAdd() {
    let added = 0;
    const noRoom: string[] = [];
    for (const id of selectedUnplaced) {
      if (placeWidgetAuto(id)) added += 1;
      else noRoom.push(id);
    }
    setBulkNote(
      noRoom.length > 0
        ? `added ${added} · no room for ${noRoom.join(", ")}`
        : `added ${added} to the canvas`,
    );
  }

  function bulkRemove() {
    for (const id of selectedPlaced) removeSlotWidget(id);
    setBulkNote(`removed ${selectedPlaced.length} from the canvas`);
  }

  function bulkExport() {
    // assign(), not location.href = — a plain assignment reads as a mutation
    window.location.assign(`/api/widget-creator/export?ids=${encodeURIComponent(selectedCustom.join(","))}`);
    setBulkNote(`downloading ${selectedCustom.length} widget${selectedCustom.length === 1 ? "" : "s"}`);
  }

  async function bulkDelete() {
    if (selectedCustom.length === 0 || bulkBusy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    setBulkBusy(true);
    setDeleteError(null);
    setBulkNote(`deleting ${selectedCustom.length}…`);
    for (const id of selectedCustom) removeSlotWidget(id);
    try {
      const error = await deleteWidgets(selectedCustom);
      setDeleteError(error);
      setBulkNote(error ? null : `deleted ${selectedCustom.length} widget${selectedCustom.length === 1 ? "" : "s"}`);
      setSelected((current) => current.filter((id) => !selectedCustom.includes(id)));
    } finally {
      setBulkBusy(false);
    }
  }

  function addToRegion(id: string, region: SlotRegionId) {
    if (placeWidget(id, region)) setAddingId(null);
  }

  const selectProps = selectMode
    ? { selectable: true, isSelected: (id: string) => selectedSet.has(id), onToggleSelect: toggleSelected }
    : {};

  return (
    <div className="hub-widget-panel">
      {selectMode ? (
        <div className="hub-widget-bulkbar">
          <div className="hub-widget-bulk-head">
            <button
              type="button"
              className="hub-widget-bulk-link"
              onClick={() => {
                setBulkNote(null);
                setSelected(allVisibleSelected ? [] : [...new Set([...selectedIds, ...visibleIds])]);
              }}
            >
              {allVisibleSelected ? "none" : "all"}
            </button>
            <span className="hub-widget-bulk-count">{selectedIds.length} selected</span>
            <button type="button" className="hub-widget-bulk-link" onClick={exitSelectMode}>
              done
            </button>
          </div>
          <div className="hub-widget-bulk-actions">
            <button
              type="button"
              className="hub-widget-bulk-btn"
              disabled={selectedUnplaced.length === 0}
              onClick={bulkAdd}
              title="add every selected widget to the first region with room"
            >
              <Plus size={11} strokeWidth={2} />
              add
            </button>
            <button
              type="button"
              className="hub-widget-bulk-btn"
              disabled={selectedPlaced.length === 0}
              onClick={bulkRemove}
              title="take the selected widgets off the canvas (they stay installed)"
            >
              <Minus size={11} strokeWidth={2} />
              remove
            </button>
            <button
              type="button"
              className="hub-widget-bulk-btn"
              disabled={selectedCustom.length === 0}
              onClick={bulkExport}
              title="download the selected custom widgets as one .zip"
            >
              <Download size={11} strokeWidth={1.75} />
              export
            </button>
            <button
              type="button"
              className={`hub-widget-bulk-btn danger${confirmDelete ? " confirm" : ""}`}
              disabled={selectedCustom.length === 0 || bulkBusy}
              onClick={bulkDelete}
              title="delete the selected custom widgets permanently"
            >
              <Trash2 size={11} strokeWidth={1.75} />
              {confirmDelete ? `delete ${selectedCustom.length}?` : "delete"}
            </button>
          </div>
          {bulkNote && <div className="hub-widget-bulk-note">{bulkNote}</div>}
        </div>
      ) : (
        <button type="button" className="hub-widget-bulk-toggle" onClick={() => setSelectMode(true)}>
          <Check size={11} strokeWidth={2.5} />
          select multiple
        </button>
      )}
      {deleteError && <div className="hub-core-io-error">{deleteError}</div>}
      <HubWidgetList
        heading={`placed · ${placedRows.length}`}
        ids={placedRows.map((row) => row.id)}
        metaFor={(id) => placedRows.find((row) => row.id === id)?.location}
        empty={placedEmpty}
        {...selectProps}
        actionFor={(id) => (
          <HubWidgetActions
            id={id}
            manifest={getManifest(id)}
            isCustom={customIds.has(id)}
            deleting={deletingId === id}
            onDelete={deleteCustomWidget}
            primaryLabel="remove widget"
            primaryTitle="remove from canvas"
            onPrimary={() => removeSlotWidget(id)}
            primaryIcon={<Minus size={13} strokeWidth={2} />}
          />
        )}
      />
      <HubWidgetList
        heading={`available · ${availableIds.length}`}
        ids={availableIds}
        empty={availableEmpty}
        {...selectProps}
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
  selectable = false,
  isSelected,
  onToggleSelect,
}: {
  heading: string;
  ids: string[];
  actionFor: (id: string) => ReactNode;
  empty: string;
  metaFor?: (id: string) => string | undefined;
  /** in select mode the row itself is the control: the per-row buttons step
      aside for a checkbox and the whole row toggles */
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  onToggleSelect?: (id: string) => void;
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
            const checked = selectable && (isSelected?.(id) ?? false);
            const toggle = () => onToggleSelect?.(id);
            return (
              <div
                className={`hub-widget-item${selectable ? " selectable" : ""}${checked ? " selected" : ""}`}
                key={id}
                {...(selectable
                  ? {
                      role: "checkbox",
                      "aria-checked": checked,
                      tabIndex: 0,
                      onClick: toggle,
                      onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => {
                        if (e.key === " " || e.key === "Enter") {
                          e.preventDefault();
                          toggle();
                        }
                      },
                    }
                  : {})}
              >
                {selectable && (
                  <span className={`hub-widget-check${checked ? " on" : ""}`} aria-hidden>
                    {checked && <Check size={9} strokeWidth={3} />}
                  </span>
                )}
                <Icon className="hub-widget-icon" size={14} strokeWidth={1.75} />
                <div className="hub-widget-text">
                  <span className="hub-widget-title">{manifest.title}</span>
                  <span className="hub-widget-meta">
                    #{id}
                    {meta && <> · {meta}</>}
                  </span>
                </div>
                {!selectable && actionFor(id)}
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

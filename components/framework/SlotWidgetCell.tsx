"use client";

// One placed widget inside a SlotRegion. Picks the widget's size preset from
// its footprint (lib/grid/presetFit.ts, docs/design/WIDGET_SIZE_PRESETS.md) and
// renders it through the same WidgetShell Graph Layout uses; widgets that
// still branch on S/M/L get the preset's legacy size, so existing content
// components need no changes. In edit mode, a remove button returns the widget
// to the unplaced pool, the move handle (or the card body, with a mouse)
// drags it to another spot, and four edge handles drag-resize the footprint,
// snapping to sizes one of its presets allows.
//
// Move drags never re-render per pointermove: the card follows the pointer
// through a transform written straight to the DOM (once per frame), and React
// only hears about it when the snapped drop target changes, to move the dashed
// drop ghost. Dropping onto a neighbour swaps the two when both fit. The
// content is a memoised WidgetShell, so neither gesture re-renders the widget
// itself unless its footprint really changed.

import {
  memo,
  useDeferredValue,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence } from "framer-motion";
import { Move, Settings2, X } from "lucide-react";
import { getManifest, isWidgetSize, resolvePresetConfig, type WidgetManifest, type WidgetSize } from "@/config/widgets";
import { SIZE_PRESETS, type PresetId } from "@/config/sizePresets";
import { minFootprint, type FrameRatios, type RegionDims } from "@/config/slotLayout";
import {
  getSlotLayout,
  removeWidget,
  setWidgetRect,
  swapWidgetRects,
  updateWidgetSettings,
  type SlotWidgetInstance,
} from "@/lib/slotLayout";
import type { WidgetInstance } from "@/lib/layout";
import { choosePreset, describeSupportedSizes, isFootprintAllowed, resizeBounds, spansForPx, type RegionPitch } from "@/lib/grid/presetFit";
import { sizeClassForFootprint } from "@/lib/grid/sizeClass";
import { useFrameGeometry } from "@/lib/grid/regionMetrics";
import { referenceGeometry, type StandardCell } from "@/lib/grid/standardCell";
import { buildOccupancy, canPlace, growRect, shrinkRect, maxGrowth, type Direction, type Rect } from "@/lib/grid/occupancy";
import type { HoverExpandEffect } from "@/lib/grid/hoverExpand";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import type { HoverGridMetrics } from "@/components/framework/SlotRegion";
import { WidgetSettingsPopover } from "@/components/framework/WidgetSettingsPopover";
import { WidgetShell, type ShellConfig } from "@/components/framework/WidgetShell";

/** WidgetShell that skips re-rendering while its config is unchanged by value.
    SlotWidgetCell rebuilds the config object every render (edit-mode
    toggles, popovers, drag state), and re-rendering a live widget — NutBot's
    terminal, a canvas animation — for nothing is most of what made dragging
    feel heavy. Context consumers inside still update as normal. */
const StableWidgetShell = memo(WidgetShell, (a, b) => {
  if (a.manifest !== b.manifest || a.entranceDelay !== b.entranceDelay) return false;
  const x: ShellConfig = a.config ?? {};
  const y: ShellConfig = b.config ?? {};
  return (
    x.size === y.size &&
    x.orientation === y.orientation &&
    x.settings === y.settings &&
    x.hoverExpanded === y.hoverExpanded &&
    x.preset === y.preset &&
    x.belowFloor === y.belowFloor &&
    x.slot?.region === y.slot?.region &&
    x.slot?.colSpan === y.slot?.colSpan &&
    x.slot?.rowSpan === y.slot?.rowSpan &&
    x.box?.width === y.box?.width &&
    x.box?.height === y.box?.height
  );
});

/** pointer travel (px) before a press on the card body becomes a move drag —
    below it the press is just a click */
const BODY_DRAG_THRESHOLD_PX = 5;
/** drop settle animation — the card glides from where it was let go into its
    slot (and a swapped neighbour glides from its old one) */
const SETTLE_MS = 220;
const SETTLE_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** viewport position a cell should animate *from* on its next layout, keyed
    by widget id. Written just before a drop commits (for the dragged card and
    a swap peer), consumed by that cell's layout effect after the new rect
    renders. Explicit hand-off rather than "animate whenever my rect changes",
    so window resizes and ratio drags never trigger a stray glide. */
const pendingSettle = new Map<string, { left: number; top: number }>();

const DIRECTIONS: Direction[] = ["n", "s", "e", "w"];

/** Hover On Expand FLIP transition duration — matches .slot-cell's
    left/top/width/height transition in globals.css */
const FLIP_DURATION_MS = 400;

/** Origin that `position: fixed` actually resolves against for `el`.
    A fixed element is only viewport-positioned while no ancestor creates a
    containing block — and the canvas .frame carries a backdrop-filter, which
    does exactly that. Without subtracting this origin the popped-out widget
    lands offset by the frame's own position: shifted down-right, clipping the
    canvas edge on one side and leaving a gap on the other. */
function fixedOrigin(el: HTMLElement): { x: number; y: number } {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const cs = getComputedStyle(node);
    if (
      cs.transform !== "none" ||
      cs.perspective !== "none" ||
      cs.filter !== "none" ||
      cs.backdropFilter !== "none" ||
      /transform|filter|perspective/.test(cs.willChange) ||
      /paint|layout|strict|content/.test(cs.contain)
    ) {
      const rect = node.getBoundingClientRect();
      // fixed resolves against that ancestor's *padding* box
      return { x: rect.left + parseFloat(cs.borderLeftWidth || "0"), y: rect.top + parseFloat(cs.borderTopWidth || "0") };
    }
  }
  return { x: 0, y: 0 };
}

/** a viewport rect expressed in the coordinates `position: fixed` uses here */
function fixedBox(cell: HTMLElement, target: DOMRect) {
  const origin = fixedOrigin(cell);
  return { left: target.left - origin.x, top: target.top - origin.y, width: target.width, height: target.height };
}

type DragState = {
  mode: "move" | "resize";
  direction?: Direction;
  pointerId: number;
  /** element holding pointer capture — released on drop */
  captureEl: HTMLElement;
  startX: number;
  startY: number;
  /** latest pointer position, consumed once per frame */
  lastX: number;
  lastY: number;
  raf: number | null;
  /** body drags stay pending until the pointer passes the threshold */
  active: boolean;
  /** move only: the other widgets in this region */
  siblings: { id: string; rect: Rect }[];
  /** move only: last valid drop — kept while the pointer crosses spots that
      don't fit, instead of snapping the target back to the start */
  target: Rect | null;
  swap: { id: string; from: Rect; to: Rect } | null;
  /** region's viewport origin at drag start — maps the pointer to a cell */
  regionLeft: number;
  regionTop: number;
  /** resize only: the snapped footprint, mirrored from previewRect so the
      drop commits the latest one even if React hasn't re-rendered yet */
  preview: Rect | null;
  /** resize only: the footprint the pointer requested that none of this
      widget's declared presets can render; it stays visible as feedback */
  unsupported: Rect | null;
  pitchX: number;
  pitchY: number;
  dims: { cols: number; rows: number };
  occupancy: boolean[][];
  baseRect: Rect;
  min: { colSpan: number; rowSpan: number };
  /** resize ceiling from the widget's presets, never below baseRect */
  max: { colSpan: number; rowSpan: number };
  /** preset geometry for snapping — see allowedFootprint */
  presets: PresetId[];
  pitch: RegionPitch;
  sc: StandardCell;
};

/** the widget's own S/M/L nearest to `size` — a declared preset's legacy size
    can be one a widget doesn't have if its presets and sizes disagree */
function supportedSize(size: WidgetSize, manifest: WidgetManifest): WidgetSize {
  if (manifest.sizes.includes(size)) return size;
  const order: WidgetSize[] = ["S", "M", "L"];
  const wanted = order.indexOf(size);
  return [...manifest.sizes].sort(
    (a, b) => Math.abs(order.indexOf(a) - wanted) - Math.abs(order.indexOf(b) - wanted),
  )[0];
}

function rectsEqual(a: Rect, b: Rect) {
  return a.col === b.col && a.row === b.row && a.colSpan === b.colSpan && a.rowSpan === b.rowSpan;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rectContains(rect: Rect, col: number, row: number) {
  return col >= rect.col && col < rect.col + rect.colSpan && row >= rect.row && row < rect.row + rect.rowSpan;
}

/** glide `el` from a viewport position it was just painted at to wherever
    layout has put it now. Web Animations, not state: nothing re-renders and
    the transform is gone the moment the animation ends. */
function settleFrom(el: HTMLElement, from: { left: number; top: number }) {
  const to = el.getBoundingClientRect();
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
    duration: SETTLE_MS,
    easing: SETTLE_EASING,
  });
}

function directionsFromPointer(e: ReactPointerEvent<HTMLElement>): Direction[] {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const horizontal = [
    { direction: "w" as const, distance: x },
    { direction: "e" as const, distance: rect.width - x },
  ];
  const vertical = [
    { direction: "n" as const, distance: y },
    { direction: "s" as const, distance: rect.height - y },
  ];

  return [...horizontal.sort((a, b) => a.distance - b.distance), ...vertical.sort((a, b) => a.distance - b.distance)].map(
    (entry) => entry.direction,
  );
}

function hoverBoxStyle(rect: Rect, metrics: HoverGridMetrics): CSSProperties {
  const xPitch = metrics.trackWidth + metrics.gap;
  const yPitch = metrics.trackHeight + metrics.gap;
  return {
    position: "absolute",
    left: rect.col * xPitch,
    top: rect.row * yPitch,
    width: rect.colSpan * metrics.trackWidth + Math.max(0, rect.colSpan - 1) * metrics.gap,
    height: rect.rowSpan * metrics.trackHeight + Math.max(0, rect.rowSpan - 1) * metrics.gap,
  };
}

export function SlotWidgetCell({
  instance,
  dims,
  frameRatios,
  hoverEffect,
  hoverMetrics,
  trackMetrics,
  onHoverIntent,
  onHoverExit,
  entranceDelay,
}: {
  instance: SlotWidgetInstance;
  /** this region's dims — SSR-safe, passed down from SlotDashboard's
      useSyncExternalStore snapshot via SlotRegion, so preset selection below
      never diverges from the server-rendered HTML */
  dims: RegionDims;
  /** SSR-safe for the same reason as `dims` */
  frameRatios: FrameRatios;
  hoverEffect?: HoverExpandEffect;
  hoverMetrics?: HoverGridMetrics;
  /** the region's measured track size — always present once measured, unlike
      hoverMetrics which only exists during a hover-expand */
  trackMetrics?: HoverGridMetrics;
  onHoverIntent?: (id: string, preferredDirections: Direction[]) => void;
  onHoverExit?: () => void;
  /** forwarded straight to WidgetShell — see its prop comment */
  entranceDelay?: number;
}) {
  const { editMode, activePopover, setActivePopover, focusWidgetId } = useLayout();
  const frameGeometry = useFrameGeometry();
  const manifest = getManifest(instance.id);
  const cellRef = useRef<HTMLDivElement>(null);
  // the settings panel portals to document.body and positions itself against
  // this button's viewport rect
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);
  /** the requested size while dragging when no declared preset supports it */
  const [unsupportedResize, setUnsupportedResize] = useState<Rect | null>(null);
  /** true while an edge handle is being dragged — shows the preset tag */
  const [resizing, setResizing] = useState(false);
  /** true while the card is lifted and following the pointer */
  const [moving, setMoving] = useState(false);
  /** where a move drag will land (and where a swapped neighbour goes) —
      only updated when the snapped target changes, never per pointermove */
  const [moveGhost, setMoveGhost] = useState<{ target: Rect; swapTo: Rect | null } | null>(null);
  // shared so opening one widget's settings closes any other open popover
  const popoverKey = `settings:${instance.id}`;
  const settingsOpen = activePopover === popoverKey;
  const activeHoverEffect = hoverEffect && hoverMetrics ? hoverEffect : undefined;

  const persistedRect: Rect = { col: instance.col, row: instance.row, colSpan: instance.colSpan, rowSpan: instance.rowSpan };
  const rect = activeHoverEffect?.visualRect ?? previewRect ?? persistedRect;
  // The footprint the content lays out against trails a resize drag by a
  // deferred render: the cell snaps to the new size at once, the widget
  // re-lays-out (possibly a heavy remount, e.g. NutBot's terminal crossing
  // into L) when the main thread is free — so the handle never stutters.
  const contentColSpan = useDeferredValue((previewRect ?? persistedRect).colSpan);
  const contentRowSpan = useDeferredValue((previewRect ?? persistedRect).rowSpan);

  // drop settle: consume a position handed off by a move drop (see
  // pendingSettle) once the new rect is laid out
  useLayoutEffect(() => {
    const from = pendingSettle.get(instance.id);
    const el = cellRef.current;
    if (!from || !el) return;
    pendingSettle.delete(instance.id);
    settleFrom(el, from);
  }, [instance.id, instance.col, instance.row, instance.colSpan, instance.rowSpan]);

  // a drag interrupted by an unmount (canvas switch, widget removed) must not
  // leave a frame callback running against a dead cell
  useLayoutEffect(() => {
    return () => {
      const drag = dragRef.current;
      if (drag?.raf != null) cancelAnimationFrame(drag.raf);
      dragRef.current = null;
    };
  }, []);

  // ── focus mode ("expand" on NutBot) ────────────────────────────────
  // The widget lifts out of its cell and grows over the canvas instead of
  // squeezing the rest of the grid: its slot stays reserved (placement is
  // explicit, so the empty area doesn't reflow anything), the card goes
  // `position: fixed` at the exact pixels it already occupied, and the next
  // frame retargets it to the frame's box — .slot-cell already transitions
  // left/top/width/height, so that reads as one smooth pop-out. Reversed on
  // exit, back to the rect the cell still owns.
  const focused = focusWidgetId === instance.id;
  const [focusBox, setFocusBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const restingRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const focusRafRef = useRef<number | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);

  const [flip, setFlip] = useState<{ rect: Rect; effect: HoverExpandEffect; metrics: HoverGridMetrics } | null>(null);
  const wasExpandedRef = useRef(false);
  const flipRafRef = useRef<number | null>(null);
  const flipTimeoutRef = useRef<number | null>(null);

  // FLIP-style entry/exit for the hover-expand preview box: position
  // changes always animate from a real "previous frame" value (instead of
  // teleporting when `position` flips between relative/absolute), mirroring
  // DESIGN_VARIATIONS "G"'s always-has-a-resting-value transition pattern.
  useLayoutEffect(() => {
    const clearPending = () => {
      if (flipRafRef.current !== null) {
        cancelAnimationFrame(flipRafRef.current);
        flipRafRef.current = null;
      }
      if (flipTimeoutRef.current !== null) {
        window.clearTimeout(flipTimeoutRef.current);
        flipTimeoutRef.current = null;
      }
    };
    clearPending();

    const resting: Rect = { col: instance.col, row: instance.row, colSpan: instance.colSpan, rowSpan: instance.rowSpan };

    if (activeHoverEffect && hoverMetrics) {
      if (!wasExpandedRef.current) {
        // entry: snap to the resting box (pixel-identical to the grid
        // placement, invisible) then animate to the expand/contract target
        // next frame so the transition has a "from" value to interpolate
        setFlip({ rect: resting, effect: activeHoverEffect, metrics: hoverMetrics });
        flipRafRef.current = requestAnimationFrame(() => {
          flipRafRef.current = null;
          setFlip({ rect: activeHoverEffect.visualRect, effect: activeHoverEffect, metrics: hoverMetrics });
        });
      } else {
        // re-target while already absolute (the hovered edge changed) — the
        // existing transition redirects smoothly mid-flight
        setFlip({ rect: activeHoverEffect.visualRect, effect: activeHoverEffect, metrics: hoverMetrics });
      }
      wasExpandedRef.current = true;
    } else if (wasExpandedRef.current) {
      wasExpandedRef.current = false;
      // exit: animate back to the resting box using the retained effect/metrics
      // (so classes/data-attrs persist through the exit animation), then drop
      // absolute positioning once the transition finishes
      setFlip((prev) => (prev ? { rect: resting, effect: prev.effect, metrics: prev.metrics } : null));
      flipTimeoutRef.current = window.setTimeout(() => {
        flipTimeoutRef.current = null;
        setFlip(null);
      }, FLIP_DURATION_MS);
    }

    return clearPending;
  }, [activeHoverEffect, hoverMetrics, instance.col, instance.row, instance.colSpan, instance.rowSpan]);

  useLayoutEffect(() => {
    const clearPending = () => {
      if (focusRafRef.current !== null) cancelAnimationFrame(focusRafRef.current);
      if (focusTimeoutRef.current !== null) window.clearTimeout(focusTimeoutRef.current);
      focusRafRef.current = null;
      focusTimeoutRef.current = null;
    };
    clearPending();

    const cell = cellRef.current;
    if (!cell) return;

    if (focused) {
      const resting = fixedBox(cell, cell.getBoundingClientRect());
      restingRectRef.current = resting;
      setFocusBox(resting);
      focusRafRef.current = requestAnimationFrame(() => {
        focusRafRef.current = null;
        const frame = cell.closest(".slot-frame")?.getBoundingClientRect();
        if (!frame) return;
        setFocusBox(fixedBox(cell, frame));
      });
    } else if (restingRectRef.current) {
      // animate home, then hand the card back to the grid
      setFocusBox(restingRectRef.current);
      focusTimeoutRef.current = window.setTimeout(() => {
        focusTimeoutRef.current = null;
        restingRectRef.current = null;
        setFocusBox(null);
      }, FLIP_DURATION_MS);
    }

    return clearPending;
  }, [focused]);

  // keep the grown card matching the frame while focused (window resize, or
  // the frame-ratio handles being dragged underneath it)
  useLayoutEffect(() => {
    if (!focused) return;
    const onResize = () => {
      const cell = cellRef.current;
      const frame = cell?.closest(".slot-frame")?.getBoundingClientRect();
      if (cell && frame) setFocusBox(fixedBox(cell, frame));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [focused]);

  // Bail out for an unregistered id only AFTER every hook above has run —
  // an early return placed among them makes the hook order conditional
  // (react-hooks/rules-of-hooks). No hook here reads `manifest`, and the
  // first use of it is resolvePresetConfig below, so this is the earliest
  // legal exit.
  if (!manifest) return null;

  const effectiveHoverEffect = activeHoverEffect ?? flip?.effect;
  const effectiveHoverMetrics = hoverMetrics ?? flip?.metrics;

  const regionDims = dims;
  // Footprint the widget's *content* is sized against — deliberately NOT the
  // hover-expand visual rect.
  //
  // Hover On Expand is a transient preview: the cell's box grows, but the
  // widget inside must keep rendering the same markup throughout. Feeding
  // `visualRect` in here meant an expand that crossed into "L" swapped the
  // per-size layout on the animation's very first frame — and because the two
  // detail branches in WidgetShell are gated on `size === "L"` / `size !== "L"`,
  // it also unmounted the always-mounted HOE panel and mounted a fresh
  // <Detail /> in its place. That is the exact mount/unmount pop the HOE panel
  // exists to avoid, and it landed a full subtree mount (for NutBot, the whole
  // terminal) on the frame where smoothness matters most.
  //
  // A drag-resize still feeds it: that gesture really is changing the
  // footprint, so re-laying-out as the user drags is the correct feedback.
  const contentRect = { colSpan: contentColSpan, rowSpan: contentRowSpan };
  const contentPx = trackMetrics
    ? {
        width: contentRect.colSpan * trackMetrics.trackWidth + Math.max(0, contentRect.colSpan - 1) * trackMetrics.gap,
        height: contentRect.rowSpan * trackMetrics.trackHeight + Math.max(0, contentRect.rowSpan - 1) * trackMetrics.gap,
      }
    : null;
  // Size preset for this footprint (docs/design/WIDGET_SIZE_PRESETS.md). Uses the
  // live frame when it describes this cell; otherwise (stacked layout, or not
  // measured yet) the reference desktop frame with this canvas's own dims and
  // ratios, so a phone shows the preset the widget has on desktop.
  const presetConfig = resolvePresetConfig(manifest);
  const declaredMinPx = manifest.minPx;
  const live = frameGeometry && !frameGeometry.stacked && trackMetrics ? frameGeometry : null;
  const geometry = live
    ? {
        sc: live.cell,
        pitch: { x: trackMetrics!.trackWidth + trackMetrics!.gap, y: trackMetrics!.trackHeight + trackMetrics!.gap, gap: trackMetrics!.gap },
      }
    : referenceGeometry(instance.region, regionDims, frameRatios);
  const presetChoice = choosePreset(
    presetConfig.presets,
    { colSpan: contentRect.colSpan, rowSpan: contentRect.rowSpan },
    regionDims,
    geometry.pitch,
    geometry.sc,
  );
  // Widgets still branch on S/M/L, so render the preset's legacy size and
  // orientation (orientation only if the widget has it — an h-only widget in
  // a column keeps h, as it did before presets).
  //
  // Exception, by the user's choice (2026-09-23): the stacked layout (<1024px)
  // keeps the pre-preset rule — S/M/L from the cell's pixel box — because its
  // full-width rows suit the wider layouts better than the desktop preset's.
  // The preset above is still computed and exposed there; it just doesn't
  // pick the layout.
  //
  // The user's "layout size" pin beats both, including hero; a pin for a size
  // the widget no longer declares quietly falls back to auto.
  const legacy = SIZE_PRESETS[presetChoice.preset].legacy;
  const auto = frameGeometry?.stacked
    ? sizeClassForFootprint(
        { colSpan: contentRect.colSpan, rowSpan: contentRect.rowSpan },
        regionDims,
        manifest.sizes,
        manifest.orientations,
        contentPx,
      )
    : {
        size: supportedSize(legacy.size, manifest),
        orientation: manifest.orientations.includes(legacy.orientation) ? legacy.orientation : manifest.orientations[0],
      };
  const override = instance.settings?.layoutSize;
  const size = isWidgetSize(override) && manifest.sizes.includes(override) ? override : auto.size;
  const orientation = auto.orientation;

  // Hover On Expand only ever reports "expanded" when there's real room to
  // borrow (createHoverExpandPreview), but content stayed locked to the
  // persisted footprint's S/M/L throughout — see the contentRect comment
  // below. That's right for the *footprint* (avoids the L Detail-subtree
  // mount/unmount thrash), but it left an S widget's box growing on hover
  // while its content stayed on the cramped S branch, wasting the borrowed
  // space. Bump the size the widget renders at, S -> M only, whenever it
  // declares an M layout: M still shares WidgetShell's non-L branch, so this
  // can't trigger that mount/unmount. Orientation is untouched — S and M
  // share whichever orientation the widget already resolved to.
  const hovering = activeHoverEffect?.state === "expanded";
  const displaySize: WidgetSize = hovering && size === "S" && manifest.sizes.includes("M") ? "M" : size;
  // Widgets built on `useWidget().preset` (the creator's output) never look at
  // `size`, so the S -> M bump alone left them on their badge/strip layout while
  // the box grew. Report the preset the hover box actually fits — capped below
  // L for the same mount/unmount reason — and, if that is still an S-class
  // preset, the smallest declared M-class one ("card").
  let displayPreset = presetChoice.preset;
  if (hovering && displaySize === "M") {
    const grown = choosePreset(
      presetConfig.presets,
      { colSpan: rect.colSpan, rowSpan: rect.rowSpan },
      regionDims,
      geometry.pitch,
      geometry.sc,
    ).preset;
    const legacyOf = (id: PresetId) => SIZE_PRESETS[id].legacy.size;
    if (legacyOf(grown) === "M") displayPreset = grown;
    else if (legacyOf(displayPreset) === "S" && presetConfig.presets.includes("card")) displayPreset = "card";
  }

  const settingsInstance: WidgetInstance = {
    id: instance.id,
    size,
    orientation,
    hidden: false,
    settings: instance.settings,
  };

  function startDrag(
    mode: DragState["mode"],
    e: ReactPointerEvent<HTMLElement>,
    direction?: Direction,
    { pending = false }: { pending?: boolean } = {},
  ) {
    onHoverExit?.();
    e.preventDefault();
    e.stopPropagation();
    const region = cellRef.current?.closest<HTMLElement>(".slot-region");
    if (!region) return;

    const slotLayout = getSlotLayout();
    const dims = slotLayout.regionDims[instance.region];
    const regionRect = region.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(region).columnGap) || 12;
    const pitchX = (regionRect.width + gap) / dims.cols;
    const pitchY = (regionRect.height + gap) / dims.rows;

    // resize limits from the widget's presets at this region's real pitch,
    // plus the legacy per-widget floors (MIN_FOOTPRINT, a declared minPx)
    const pitch: RegionPitch = { x: pitchX, y: pitchY, gap };
    const sc = frameGeometry && !frameGeometry.stacked ? frameGeometry.cell : geometry.sc;
    const bounds = resizeBounds(presetConfig.presets, dims, pitch, sc);
    const spanMin = minFootprint(instance.id);
    const min = {
      colSpan: Math.max(spanMin.colSpan, bounds.min.colSpan, declaredMinPx ? spansForPx(declaredMinPx.width, pitchX, gap) : 1),
      rowSpan: Math.max(spanMin.rowSpan, bounds.min.rowSpan, declaredMinPx ? spansForPx(declaredMinPx.height, pitchY, gap) : 1),
    };
    // never above the current footprint: a widget already placed below its
    // floor (placed before the floor existed, or squeezed by a region/screen
    // change) must not "shrink" into a bigger rect that could overlap
    // neighbours — it just can't get any smaller
    min.colSpan = Math.min(min.colSpan, persistedRect.colSpan);
    min.rowSpan = Math.min(min.rowSpan, persistedRect.rowSpan);

    const siblings = slotLayout.widgets
      .filter((w) => w.region === instance.region && w.id !== instance.id)
      .map((w) => ({ id: w.id, rect: { col: w.col, row: w.row, colSpan: w.colSpan, rowSpan: w.rowSpan } }));

    dragRef.current = {
      mode,
      direction,
      pointerId: e.pointerId,
      captureEl: e.currentTarget,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      raf: null,
      active: !pending,
      siblings,
      target: null,
      swap: null,
      regionLeft: regionRect.left,
      regionTop: regionRect.top,
      pitchX,
      pitchY,
      dims,
      occupancy: buildOccupancy(dims, siblings.map((s) => s.rect)),
      baseRect: persistedRect,
      preview: null,
      unsupported: null,
      min,
      // a widget already placed above its ceiling isn't forced smaller
      max: {
        colSpan: Math.max(bounds.max.colSpan, persistedRect.colSpan),
        rowSpan: Math.max(bounds.max.rowSpan, persistedRect.rowSpan),
      },
      presets: presetConfig.presets,
      pitch,
      sc,
    };
    if (mode === "resize") {
      setUnsupportedResize(null);
      setResizing(true);
    }
    else if (!pending) setMoving(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  /** press on the card body (mouse/pen, edit mode) — becomes a move drag once
      the pointer travels past the threshold. Touch keeps the explicit handle:
      on a phone the body press has to stay free to scroll the page. */
  function handleBodyPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!editMode || e.button !== 0 || e.pointerType === "touch" || focusBox) return;
    if ((e.target as HTMLElement).closest("button, .resize-handle, input, textarea, select, a")) return;
    startDrag("move", e, undefined, { pending: true });
  }

  /** a footprint some declared preset allows (or the one the widget started
      the drag at, so it can always be dragged back) */
  function allowedFootprint(drag: DragState, candidate: Rect) {
    return (
      (candidate.colSpan === drag.baseRect.colSpan && candidate.rowSpan === drag.baseRect.rowSpan) ||
      isFootprintAllowed(drag.presets, candidate, drag.dims, drag.pitch, drag.sc)
    );
  }

  /** dropping onto neighbour B trades places: this widget takes B's origin,
      B takes this widget's. Only when both land in bounds, clear of everyone
      else and of each other. */
  function trySwap(drag: DragState, peer: { id: string; rect: Rect }) {
    const to: Rect = { ...drag.baseRect, col: peer.rect.col, row: peer.rect.row };
    const peerTo: Rect = { ...peer.rect, col: drag.baseRect.col, row: drag.baseRect.row };
    const others = drag.siblings.filter((s) => s.id !== peer.id).map((s) => s.rect);
    if (!canPlace(to, drag.dims, buildOccupancy(drag.dims, others))) return null;
    if (!canPlace(peerTo, drag.dims, buildOccupancy(drag.dims, [...others, to]))) return null;
    return { target: to, swap: { id: peer.id, from: peer.rect, to: peerTo } };
  }

  function stepMove(drag: DragState) {
    const dx = drag.lastX - drag.startX;
    const dy = drag.lastY - drag.startY;
    cellRef.current?.style.setProperty("transform", `translate(${dx}px, ${dy}px)`);

    const base = drag.baseRect;
    const candidate: Rect = {
      ...base,
      col: clamp(base.col + Math.round(dx / drag.pitchX), 0, drag.dims.cols - base.colSpan),
      row: clamp(base.row + Math.round(dy / drag.pitchY), 0, drag.dims.rows - base.rowSpan),
    };
    const pointerCol = Math.floor((drag.lastX - drag.regionLeft) / drag.pitchX);
    const pointerRow = Math.floor((drag.lastY - drag.regionTop) / drag.pitchY);
    const peer = drag.siblings.find((s) => rectContains(s.rect, pointerCol, pointerRow));

    let next: { target: Rect | null; swap: DragState["swap"] } | null = null;
    if (rectsEqual(candidate, base)) {
      next = { target: null, swap: null };
    } else if (peer) {
      next = trySwap(drag, peer);
    }
    if (!next && canPlace(candidate, drag.dims, drag.occupancy)) {
      next = { target: candidate, swap: null };
    }
    if (!next) {
      // the snapped spot is taken — settle for the closest free one a cell
      // away, else keep the last good target rather than snapping back home
      let best: Rect | null = null;
      let bestDist = Infinity;
      for (let r = -1; r <= 1; r++) {
        for (let c = -1; c <= 1; c++) {
          const probe: Rect = { ...candidate, col: candidate.col + c, row: candidate.row + r };
          if (rectsEqual(probe, base) || !canPlace(probe, drag.dims, drag.occupancy)) continue;
          const dist = Math.hypot(
            base.col + dx / drag.pitchX - probe.col,
            base.row + dy / drag.pitchY - probe.row,
          );
          if (dist < bestDist) {
            best = probe;
            bestDist = dist;
          }
        }
      }
      if (best) next = { target: best, swap: null };
    }
    if (!next) return;

    const sameTarget =
      (next.target === null && drag.target === null) ||
      (next.target !== null && drag.target !== null && rectsEqual(next.target, drag.target));
    const sameSwap = (next.swap?.id ?? null) === (drag.swap?.id ?? null);
    if (sameTarget && sameSwap) return;
    drag.target = next.target;
    drag.swap = next.swap;
    setMoveGhost(next.target ? { target: next.target, swapTo: next.swap?.to ?? null } : null);
  }

  function stepResize(drag: DragState) {
    if (!drag.direction) return;
    const deltaCellsX = Math.round((drag.lastX - drag.startX) / drag.pitchX);
    const deltaCellsY = Math.round((drag.lastY - drag.startY) / drag.pitchY);
    let outward = 0;
    if (drag.direction === "e") outward = deltaCellsX;
    else if (drag.direction === "w") outward = -deltaCellsX;
    else if (drag.direction === "s") outward = deltaCellsY;
    else outward = -deltaCellsY;

    // Snap: take the furthest step toward the pointer whose footprint a
    // preset allows, so the handle skips sizes the widget has no layout for
    // (e.g. badge 2x1 → card 2x2 never stops on a 1x2 it can't do).
    let next: Rect = drag.baseRect;
    let requested: Rect | null = null;
    const horizontal = drag.direction === "e" || drag.direction === "w";
    if (outward > 0) {
      const ceiling = horizontal
        ? drag.max.colSpan - drag.baseRect.colSpan
        : drag.max.rowSpan - drag.baseRect.rowSpan;
      const limit = Math.min(outward, ceiling, maxGrowth(drag.baseRect, drag.direction, drag.dims, drag.occupancy));
      if (limit > 0) requested = growRect(drag.baseRect, drag.direction, limit);
      for (let step = limit; step >= 1; step--) {
        const candidate = growRect(drag.baseRect, drag.direction, step);
        if (allowedFootprint(drag, candidate)) {
          next = candidate;
          break;
        }
      }
    } else if (outward < 0) {
      requested = shrinkRect(drag.baseRect, drag.direction, -outward, drag.min);
      for (let step = -outward; step >= 1; step--) {
        const candidate = shrinkRect(drag.baseRect, drag.direction, step, drag.min);
        if (!rectsEqual(candidate, drag.baseRect) && allowedFootprint(drag, candidate)) {
          next = candidate;
          break;
        }
      }
    }

    // The resize itself skips an unsupported footprint so a widget never
    // renders a layout it does not have. Do show the size the pointer asked
    // for, though — otherwise 1x2 feels like a broken handle rather than an
    // unavailable preset.
    const unsupported = requested && !rectsEqual(requested, drag.baseRect) && !allowedFootprint(drag, requested)
      ? requested
      : null;
    const sameUnsupported =
      (drag.unsupported === null && unsupported === null) ||
      (drag.unsupported !== null && unsupported !== null && rectsEqual(drag.unsupported, unsupported));
    if (!sameUnsupported) {
      drag.unsupported = unsupported;
      setUnsupportedResize(unsupported);
    }

    const nextPreview = rectsEqual(next, drag.baseRect) ? null : next;
    const current = drag.preview;
    if (current === nextPreview || (current && nextPreview && rectsEqual(current, nextPreview))) return;
    drag.preview = nextPreview;
    setPreviewRect(nextPreview);
  }

  function step(drag: DragState) {
    drag.raf = null;
    if (dragRef.current !== drag) return;
    if (drag.mode === "move") stepMove(drag);
    else stepResize(drag);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < BODY_DRAG_THRESHOLD_PX) return;
      drag.active = true;
      setMoving(true);
    }
    // coalesce to one layout pass per frame — pointermove can fire several
    // times a frame on high-rate mice
    if (drag.raf === null) drag.raf = requestAnimationFrame(() => step(drag));
  }

  function finishMove(drag: DragState, cancelled: boolean) {
    setMoving(false);
    setMoveGhost(null);
    const el = cellRef.current;
    if (!el || !drag.active) return;
    const visual = el.getBoundingClientRect();
    el.style.removeProperty("transform");
    const from = { left: visual.left, top: visual.top };

    const target = cancelled ? null : drag.target;
    if (!target) {
      settleFrom(el, from);
      return;
    }

    pendingSettle.set(instance.id, from);
    if (drag.swap) {
      const peerEl = el.parentElement?.querySelector<HTMLElement>(`[data-widget-id="${CSS.escape(drag.swap.id)}"]`);
      if (peerEl) {
        const peerBox = peerEl.getBoundingClientRect();
        pendingSettle.set(drag.swap.id, { left: peerBox.left, top: peerBox.top });
      }
      swapWidgetRects(instance.id, target, drag.swap.id, drag.swap.to);
    } else {
      setWidgetRect(instance.id, target);
    }

    // the store re-validates and can refuse (e.g. a sync landed mid-drag and
    // took the spot) — then nothing re-lays-out, so glide home by hand
    const now = getSlotLayout().widgets.find((w) => w.id === instance.id);
    if (!now || (now.col === drag.baseRect.col && now.row === drag.baseRect.row)) {
      pendingSettle.delete(instance.id);
      if (drag.swap) pendingSettle.delete(drag.swap.id);
      settleFrom(el, from);
    }
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.raf !== null) {
      // apply the final pointer position the pending frame would have
      cancelAnimationFrame(drag.raf);
      step(drag);
    }
    if (drag.captureEl.hasPointerCapture(drag.pointerId)) drag.captureEl.releasePointerCapture(drag.pointerId);
    dragRef.current = null;

    if (drag.mode === "move") {
      finishMove(drag, e.type === "pointercancel");
      return;
    }

    setResizing(false);
    // commit before clearing the preview — setWidgetRect notifies
    // SlotDashboard's useSyncExternalStore listener, which must not happen
    // from inside a setState updater (that runs during this component's
    // render/reconciliation and trips React's cross-component setState check)
    if (drag.preview && e.type !== "pointercancel" && !rectsEqual(drag.preview, persistedRect)) {
      setWidgetRect(instance.id, drag.preview);
    }
    setPreviewRect(null);
    setUnsupportedResize(null);
  }

  function handleHoverPointerEnter(e: ReactPointerEvent<HTMLDivElement>) {
    if (editMode || previewRect || e.pointerType === "touch") return;
    onHoverIntent?.(instance.id, directionsFromPointer(e));
  }

  // Exits are owned by SlotRegion's pointermove tracking (sticky "still inside"
  // + debounced exit + region pointerleave). The cell does NOT clear on its own
  // pointerleave: doing so fired an abrupt clear-to-resting the instant the
  // pointer crossed into a neighbor, which is what made handoffs flash back to
  // default size before re-expanding.

  const hoverStyle = flip && effectiveHoverMetrics ? hoverBoxStyle(flip.rect, effectiveHoverMetrics) : null;
  // focus wins over a hover-expand preview: both position the same box
  const focusStyle: CSSProperties | null = focusBox
    ? { position: "fixed", left: focusBox.left, top: focusBox.top, width: focusBox.width, height: focusBox.height, zIndex: 60 }
    : null;

  // clamp the grid placement to the region's track count so a stale/oversized
  // rect (e.g. left over from a region shrink or an interrupted resize) can
  // never reference an implicit track outside the region and overflow it
  const safeColSpan = Math.max(1, Math.min(rect.colSpan, regionDims.cols));
  const safeRowSpan = Math.max(1, Math.min(rect.rowSpan, regionDims.rows));
  const safeCol = Math.min(Math.max(0, rect.col), regionDims.cols - safeColSpan);
  const safeRow = Math.min(Math.max(0, rect.row), regionDims.rows - safeRowSpan);

  // the resize tag reads the live snapped footprint, not the deferred one
  const tagPreset =
    resizing && previewRect
      ? choosePreset(
          presetConfig.presets,
          { colSpan: previewRect.colSpan, rowSpan: previewRect.rowSpan },
          regionDims,
          geometry.pitch,
          geometry.sc,
        ).preset
      : null;

  const ghostStyle = (r: Rect): CSSProperties => ({
    gridColumn: `${r.col + 1} / span ${r.colSpan}`,
    gridRow: `${r.row + 1} / span ${r.rowSpan}`,
  });

  // What this widget can be resized to, in this region's own spans. Shown on
  // the resize handles (edit mode) and, while a drag asks for a size no preset
  // supports, inside the ghost of that size — so a refused resize says why and
  // names the shapes that would work instead.
  const supportedSizes =
    editMode || unsupportedResize
      ? describeSupportedSizes(presetConfig.presets, regionDims, geometry.pitch, geometry.sc)
      : "";

  return (
    <>
    {moveGhost && (
      <>
        <div className="slot-drop-ghost" style={ghostStyle(moveGhost.target)} aria-hidden />
        {moveGhost.swapTo && <div className="slot-drop-ghost swap" style={ghostStyle(moveGhost.swapTo)} aria-hidden />}
      </>
    )}
    {resizing && unsupportedResize && (
      <div className="slot-drop-ghost unsupported" style={ghostStyle(unsupportedResize)} role="status">
        <span className="slot-ghost-title">
          {unsupportedResize.colSpan}×{unsupportedResize.rowSpan} not available
        </span>
        <span className="slot-ghost-hint">{supportedSizes}</span>
        <span className="slot-ghost-hint">
          release keeps {SIZE_PRESETS[tagPreset ?? presetChoice.preset].label} · {(previewRect ?? persistedRect).colSpan}×{(previewRect ?? persistedRect).rowSpan}
        </span>
      </div>
    )}
    <div
      ref={cellRef}
      className={`slot-cell${editMode ? " editing" : ""}${previewRect ? " resizing" : ""}${moving ? " dragging" : ""}${
        effectiveHoverEffect ? ` hover-${effectiveHoverEffect.state}` : ""
      }${focusBox ? " focused" : ""}`}
      data-widget-id={instance.id}
      data-hover-expand={effectiveHoverEffect?.state}
      style={{
        // the grid placement stays set while focused so the slot is still
        // reserved — the fixed positioning below just lifts the card out of it
        gridColumn: hoverStyle ? undefined : `${safeCol + 1} / span ${safeColSpan}`,
        gridRow: hoverStyle ? undefined : `${safeRow + 1} / span ${safeRowSpan}`,
        ...hoverStyle,
        ...focusStyle,
      }}
      onPointerEnter={handleHoverPointerEnter}
      onPointerDown={handleBodyPointerDown}
      // every drag (handle, edge or body) captures the pointer on the element
      // it started on; the moves bubble up to here
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Edit-mode controls stay mounted but inert (CSS hides them and turns
          off pointer-events until .slot-cell.editing) so entering/leaving edit
          mode can fade them in/out instead of popping — a mount/unmount can't
          be CSS-transitioned. tabIndex tracks editMode so they leave the tab
          order when hidden. */}
      <button
        type="button"
        className="slot-move-btn"
        aria-label={`move ${instance.id} widget`}
        title="move widget"
        tabIndex={editMode ? 0 : -1}
        aria-hidden={!editMode}
        onPointerDown={(e) => startDrag("move", e)}
      >
        <Move size={12} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="slot-remove-btn"
        aria-label={`remove ${instance.id} widget`}
        tabIndex={editMode ? 0 : -1}
        aria-hidden={!editMode}
        onClick={() => removeWidget(instance.id)}
      >
        <X size={12} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        ref={settingsBtnRef}
        className="slot-settings-btn"
        aria-label={`configure ${instance.id} widget`}
        tabIndex={editMode ? 0 : -1}
        aria-hidden={!editMode}
        onClick={() => setActivePopover(settingsOpen ? null : popoverKey)}
      >
        <Settings2 size={12} strokeWidth={1.75} />
      </button>
      <AnimatePresence>
        {editMode && settingsOpen && (
          <WidgetSettingsPopover
            key="slot-settings"
            manifest={manifest}
            instance={settingsInstance}
            onUpdateSettings={(settings) => updateWidgetSettings(instance.id, settings)}
            onHide={() => removeWidget(instance.id)}
            onClose={() => setActivePopover(null)}
            anchorRef={settingsBtnRef}
          />
        )}
      </AnimatePresence>
      {DIRECTIONS.map((dir) => (
        <div
          key={dir}
          className={`resize-handle resize-handle-${dir}`}
          title={supportedSizes ? `resize · this widget supports ${supportedSizes}` : undefined}
          onPointerDown={(e) => startDrag("resize", e, dir)}
        />
      ))}
      {/* while a request is refused the ghost carries this (the tag sits on the
          cell's bottom edge, right where a growing ghost's text lands) */}
      {resizing && previewRect && !unsupportedResize && (
        <div className="slot-preset-tag" aria-live="polite">
          {`${SIZE_PRESETS[tagPreset ?? presetChoice.preset].label} · ${previewRect.colSpan}×${previewRect.rowSpan}`}
        </div>
      )}
      <StableWidgetShell
        manifest={manifest}
        config={{
          size: displaySize,
          orientation,
          settings: instance.settings,
          hoverExpanded: activeHoverEffect?.state === "expanded",
          // a hover-expand reports its visual box; otherwise the (deferred)
          // content footprint, so a resize re-renders the widget once per
          // settled size rather than on every snap
          slot: activeHoverEffect
            ? { region: instance.region, colSpan: rect.colSpan, rowSpan: rect.rowSpan }
            : { region: instance.region, colSpan: contentRect.colSpan, rowSpan: contentRect.rowSpan },
          preset: displayPreset,
          box: contentPx ?? undefined,
          belowFloor: presetChoice.belowFloor,
        }}
        entranceDelay={entranceDelay}
      />
    </div>
    </>
  );
}

"use client";

// Per-widget configuration popover, opened from the gear button that appears
// on each card in edit mode. The Placement section is the same for every
// widget (limited to what its manifest supports); the Widget section is
// auto-generated from the manifest's settings schema.
//
// The panel is PORTALLED to document.body and positioned `fixed` against the
// gear button's viewport rect. It used to be an absolutely-positioned child of
// the card, which meant a 250px panel could be wider than the widget it
// configured, and — worse — that it sat inside the card's `@container widget`
// scope, so `.wset-row` labels and `.seg-btn` text were being *deleted* on
// small widgets (`font-size: 0`) to make it fit. Settings UI must never scale
// with the thing it configures: every widget, at every size, gets the same
// panel now. Do not reintroduce those container queries.
//
// Note the sibling SlotPlacementPopover still composes the base `.wset-panel`
// class and relies on its `position: absolute` anchoring, so the portal styling
// lives on the `.wset-portal` modifier rather than on `.wset-panel` itself.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { EyeOff, X } from "lucide-react";
import {
  FRAMEWORK_SETTINGS,
  type SettingsField,
  type SettingsValues,
  type WidgetManifest,
} from "@/config/widgets";
import type { WidgetInstance } from "@/lib/layout";
import { useLayout } from "@/components/dashboard/LayoutProvider";

/** panel width; mirrored by `.wset-panel.wset-portal` in globals.css */
const PANEL_WIDTH = 264;
/** gap between the gear button and the panel edge */
const ANCHOR_GAP = 6;
/** keep-off-the-viewport-edge margin */
const VIEWPORT_MARGIN = 8;

function SchemaField({
  field,
  value,
  onChange,
}: {
  field: SettingsField;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  switch (field.type) {
    case "toggle":
      return (
        <label className="wset-row">
          <span>{field.label}</span>
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        </label>
      );
    case "segment":
      return (
        <div className="wset-row">
          <span>{field.label}</span>
          <div className="seg-row">
            {field.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`seg-btn${String(value) === o.value ? " active" : ""}`}
                aria-pressed={String(value) === o.value}
                onClick={() => onChange(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      );
    case "select":
      return (
        <label className="wset-row">
          <span>{field.label}</span>
          <select className="wset-select" value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "number":
      return (
        <label className="wset-row">
          <span>{field.label}</span>
          <input
            className="wset-input"
            type="number"
            min={field.min}
            max={field.max}
            value={Number(value)}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isNaN(n)) onChange(n);
            }}
          />
        </label>
      );
    case "text":
    case "password":
      return (
        <label className="wset-row">
          <span>{field.label}</span>
          <input
            className="wset-input"
            type={field.type === "password" ? "password" : "text"}
            placeholder={field.placeholder}
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={field.type === "password" ? "new-password" : "off"}
            spellCheck={false}
          />
        </label>
      );
  }
}

export function WidgetSettingsPopover({
  manifest,
  instance,
  onClose,
  onUpdateSettings,
  onHide,
  hideWidgetSettings = false,
  anchorRef,
}: {
  manifest: WidgetManifest;
  instance: WidgetInstance;
  onClose: () => void;
  onUpdateSettings?: (settings: SettingsValues) => void;
  onHide?: () => void;
  hideWidgetSettings?: boolean;
  /** the gear button the panel is positioned against. A ref, not the element:
      reading `.current` during the parent's render is not allowed, so the
      element is resolved inside the positioning effect instead. */
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const { updateInstance } = useLayout();
  const panelRef = useRef<HTMLDivElement>(null);

  // A customHeader widget draws its own header, so the shell never renders the
  // name/icon at all and the headerStyle control would do nothing — drop it
  // rather than offer a dead three-way toggle. plainChrome widgets (the
  // namecard) still get it: they skip the card chrome but not the header.
  const frameworkFields = manifest.flags?.customHeader
    ? FRAMEWORK_SETTINGS.filter((f) => f.key !== "headerStyle")
    : FRAMEWORK_SETTINGS;

  function updateSettings(settings: SettingsValues) {
    if (onUpdateSettings) onUpdateSettings(settings);
    else updateInstance(instance.id, { settings });
  }

  // `null` until measured — the panel renders hidden for one frame so its real
  // height can be read before deciding whether it opens below or above.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef?.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const r = anchor.getBoundingClientRect();
    const h = panel.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // right-align to the gear (matching the old top-right anchoring), then
    // clamp so a widget near either frame edge still gets the full panel
    const maxLeft = Math.max(VIEWPORT_MARGIN, vw - PANEL_WIDTH - VIEWPORT_MARGIN);
    const left = Math.min(Math.max(r.right - PANEL_WIDTH, VIEWPORT_MARGIN), maxLeft);

    // prefer below the gear; flip above when it would overflow the viewport
    let top = r.bottom + ANCHOR_GAP;
    if (top + h > vh - VIEWPORT_MARGIN) {
      const above = r.top - h - ANCHOR_GAP;
      top = above >= VIEWPORT_MARGIN ? above : Math.max(VIEWPORT_MARGIN, vh - h - VIEWPORT_MARGIN);
    }
    setPos({ top, left });
  }, [anchorRef]);

  useLayoutEffect(() => {
    reposition();
    window.addEventListener("resize", reposition);
    // capture: the frame and region columns scroll independently of the page
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [reposition]);

  useEffect(() => {
    function onDown(e: PointerEvent) {
      const target = e.target as Element;
      // the gear button toggles on click — closing here too would reopen it
      if (target.closest(".gear-btn, .slot-settings-btn")) return;
      if (panelRef.current && !panelRef.current.contains(target)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      ref={panelRef}
      className="wset-panel wset-portal"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      <div className="wset-head">
        <span className="wset-title">{manifest.title}</span>
        <button type="button" className="overlay-close" onClick={onClose} aria-label="close widget settings">
          <X size={11} strokeWidth={2} />
        </button>
      </div>


      <div className="wset-section">interaction</div>
      {frameworkFields.map((field) => (
        <SchemaField
          key={field.key}
          field={field}
          value={instance.settings[field.key] ?? field.default}
          onChange={(value) => updateSettings({ [field.key]: value })}
        />
      ))}

      {onHide && (
        <button
          type="button"
          className="wset-hide-btn"
          onClick={() => {
            onHide();
            onClose();
          }}
        >
          <EyeOff size={12} strokeWidth={1.75} />
          remove widget
        </button>
      )}

      {!hideWidgetSettings && (manifest.settings?.length ?? 0) > 0 && (
        <>
          <div className="wset-section">widget</div>
          {manifest.settings!.map((field) => (
            <SchemaField
              key={field.key}
              field={field}
              value={instance.settings[field.key] ?? field.default}
              onChange={(value) => updateSettings({ [field.key]: value })}
            />
          ))}
        </>
      )}
    </motion.div>,
    document.body,
  );
}

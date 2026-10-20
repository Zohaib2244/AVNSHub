"use client";

// Per-widget configuration dialog, opened from the gear button that appears
// on each card in edit mode. Android-widget style: a centred panel over a dim
// that spotlights the widget being configured (every other widget dims, this
// one stays lit so you can see which card you're editing). The Placement
// section is the same for every widget; the Widget section is auto-generated
// from the manifest's settings schema.
//
// Edits are a DRAFT until Save: the save button only becomes active once a
// value actually differs from what's stored. Closing any other way — the ×,
// a click on the dim/outside the panel, or Escape — discards the draft.
// "remove widget" is a direct action and applies immediately.
//
// The dialog is PORTALLED to document.body. It used to be an absolutely-
// positioned child of the card, which put it inside the card's
// `@container widget` scope, so `.wset-row` labels and `.seg-btn` text were
// *deleted* on small widgets (`font-size: 0`) to make it fit. Settings UI must
// never scale with the thing it configures. Do not reintroduce those container
// queries.
//
// Note the sibling SlotPlacementPopover still composes the base `.wset-panel`
// class and relies on its `position: absolute` anchoring, so the dialog styling
// lives on the `.wset-modal` modifier rather than on `.wset-panel` itself.

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { EyeOff, X } from "lucide-react";
import {
  FRAMEWORK_SETTINGS,
  type SettingsField,
  type SettingsValues,
  type WidgetManifest,
  type WidgetSize,
} from "@/config/widgets";
import type { WidgetInstance } from "@/lib/layout";
import { useLayout } from "@/components/dashboard/LayoutProvider";

/** breathing room between the spotlit widget and its cut-out edge */
const SPOTLIGHT_PAD = 6;

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
  /** the gear button that opened the dialog; its card is the one spotlit.
      A ref, not the element: reading `.current` during the parent's render is
      not allowed, so it's resolved inside the measuring effect instead. */
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const { updateInstance } = useLayout();

  // A customHeader widget draws its own header, so the shell never renders the
  // name/icon at all and the headerStyle control would do nothing — drop it
  // rather than offer a dead three-way toggle. plainChrome widgets (the
  // namecard) still get it: they skip the card chrome but not the header.
  //
  // layoutSize offers only the sizes this widget actually has (plus auto),
  // and disappears for a single-size widget, where every choice is the same.
  const frameworkFields = FRAMEWORK_SETTINGS.filter(
    (f) => !(f.key === "headerStyle" && manifest.flags?.customHeader) && !(f.key === "layoutSize" && manifest.sizes.length < 2),
  ).map((f) =>
    f.key === "layoutSize" && (f.type === "segment" || f.type === "select")
      ? { ...f, options: f.options.filter((o) => o.value === "auto" || manifest.sizes.includes(o.value as WidgetSize)) }
      : f,
  );
  const widgetFields = !hideWidgetSettings ? manifest.settings ?? [] : [];

  const [draft, setDraft] = useState<SettingsValues>({});

  const savedValue = useCallback(
    (field: SettingsField) => instance.settings[field.key] ?? field.default,
    [instance.settings],
  );
  const valueOf = (field: SettingsField) => (field.key in draft ? draft[field.key] : savedValue(field));

  // only keys whose draft differs from what's stored — editing a value and
  // then changing it back leaves the dialog clean again
  const changes: SettingsValues = {};
  for (const field of [...frameworkFields, ...widgetFields]) {
    if (field.key in draft && draft[field.key] !== savedValue(field)) changes[field.key] = draft[field.key];
  }
  const dirty = Object.keys(changes).length > 0;

  function save() {
    if (!dirty) return;
    if (onUpdateSettings) onUpdateSettings(changes);
    else updateInstance(instance.id, { settings: changes });
    onClose();
  }

  // viewport rect of the card being configured, for the spotlight cut-out
  const [spot, setSpot] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const measure = useCallback(() => {
    const card = anchorRef?.current?.closest<HTMLElement>(".slot-cell, .widget-slot");
    if (!card) return setSpot(null);
    const r = card.getBoundingClientRect();
    setSpot({
      top: r.top - SPOTLIGHT_PAD,
      left: r.left - SPOTLIGHT_PAD,
      width: r.width + SPOTLIGHT_PAD * 2,
      height: r.height + SPOTLIGHT_PAD * 2,
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    // capture: the frame and region columns scroll independently of the page
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } };

  return createPortal(
    <>
      {/* the dim: a cut-out box whose huge spread shadow darkens everything
          except the spotlit card; falls back to a plain full-screen dim */}
      <motion.div
        className={`wset-dim${spot ? " wset-dim-spot" : ""}`}
        style={spot ?? undefined}
        aria-hidden="true"
        {...fade}
      />
      {/* click catcher — any click outside the panel closes (and discards) */}
      <div className="wset-backdrop" onPointerDown={onClose} aria-hidden="true" />
      <div className="wset-modal-wrap">
        <motion.div
          className="wset-panel wset-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${manifest.title} settings`}
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.96 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <div className="wset-head">
            <span className="wset-title">{manifest.title}</span>
            <button type="button" className="overlay-close" onClick={onClose} aria-label="close widget settings">
              <X size={11} strokeWidth={2} />
            </button>
          </div>

          <div className="wset-modal-body">
            <div className="wset-section">interaction</div>
            {frameworkFields.map((field) => (
              <SchemaField
                key={field.key}
                field={field}
                value={valueOf(field)}
                onChange={(value) => setDraft((d) => ({ ...d, [field.key]: value }))}
              />
            ))}

            {widgetFields.length > 0 && (
              <>
                <div className="wset-section">widget</div>
                {widgetFields.map((field) => (
                  <SchemaField
                    key={field.key}
                    field={field}
                    value={valueOf(field)}
                    onChange={(value) => setDraft((d) => ({ ...d, [field.key]: value }))}
                  />
                ))}
              </>
            )}

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
          </div>

          <div className="wset-modal-actions">
            <span className="wset-modal-hint">{dirty ? "unsaved changes" : "no changes"}</span>
            <button type="button" className="wset-save" disabled={!dirty} onClick={save}>
              save
            </button>
          </div>
        </motion.div>
      </div>
    </>,
    document.body,
  );
}

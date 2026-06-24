"use client";

// Per-widget configuration popover, opened from the gear button that appears
// on each card in edit mode. The Placement section is the same for every
// widget (limited to what its manifest supports); the Widget section is
// auto-generated from the manifest's settings schema.

import { useEffect, useRef } from "react";
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
}: {
  manifest: WidgetManifest;
  instance: WidgetInstance;
  onClose: () => void;
  onUpdateSettings?: (settings: SettingsValues) => void;
  onHide?: () => void;
  hideWidgetSettings?: boolean;
}) {
  const { updateInstance } = useLayout();
  const panelRef = useRef<HTMLDivElement>(null);

  function updateSettings(settings: SettingsValues) {
    if (onUpdateSettings) onUpdateSettings(settings);
    else updateInstance(instance.id, { settings });
  }

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

  return (
    <motion.div
      ref={panelRef}
      className="wset-panel"
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
      {FRAMEWORK_SETTINGS.map((field) => (
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
    </motion.div>
  );
}

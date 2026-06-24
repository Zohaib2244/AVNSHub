"use client";

// Small icon grid shared by CanvasSwitcher's per-pill manage flyout and
// HubCorePanel's "canvases" settings section — pick one of CANVAS_ICONS, or
// "Aa" to clear back to the first-letter-of-name fallback (see
// CanvasGlyph in CanvasSwitcher.tsx).

import { CANVAS_ICONS, CANVAS_ICON_NAMES } from "@/config/canvasIcons";

export function CanvasIconPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (icon: string | null) => void;
}) {
  return (
    <div className="canvas-icon-grid">
      <button
        type="button"
        className={`canvas-icon-btn canvas-icon-btn-letter${!value ? " active" : ""}`}
        onClick={() => onChange(null)}
        title="use first letter"
        aria-label="use first letter as icon"
      >
        Aa
      </button>
      {CANVAS_ICON_NAMES.map((name) => {
        const Icon = CANVAS_ICONS[name];
        return (
          <button
            key={name}
            type="button"
            className={`canvas-icon-btn${value === name ? " active" : ""}`}
            onClick={() => onChange(name)}
            title={name}
            aria-label={`use ${name} icon`}
          >
            <Icon size={13} strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}

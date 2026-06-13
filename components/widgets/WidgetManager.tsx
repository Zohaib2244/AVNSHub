"use client";

// The widget manager — itself a widget, and the single surface for adding and
// removing widgets from the dashboard. Widgets already on screen can be
// removed (hidden); widgets not on screen can be added back. It can never hide
// itself (see ALWAYS_VISIBLE in lib/layout.ts), so there's always a way back.
//
// Per-size layout: S shows a compact count summary, M/L show the full
// add/remove gallery (L adds a one-line description of what each does).

import { Lock, Minus, Plus } from "lucide-react";
import { DEFAULT_ORDER, WIDGETS, type WidgetId, type WidgetManifest } from "@/config/widgets";
import { useWidget } from "@/components/framework/WidgetContext";
import { useLayout } from "@/components/LayoutProvider";

/** the widget manager can never remove itself — it's the only way to re-add
    hidden widgets (mirrors ALWAYS_VISIBLE in lib/layout.ts) */
const LOCKED: WidgetId[] = ["widgets"];

export function WidgetManager() {
  const { size } = useWidget();
  const { layout, updateInstance } = useLayout();

  // keep a stable registry order regardless of current grid order
  const byId = new Map(layout.widgets.map((w) => [w.id, w]));
  const ordered = DEFAULT_ORDER.filter((id) => byId.has(id));
  const onScreen = ordered.filter((id) => !byId.get(id)!.hidden);
  const available = ordered.filter((id) => byId.get(id)!.hidden);

  if (size === "S") {
    return (
      <div className="wm-summary">
        <div className="block-stat">{onScreen.length}</div>
        <div className="block-sub">
          on screen · {available.length} available
        </div>
      </div>
    );
  }

  const showDesc = size === "L";

  return (
    <div className="wm">
      <Section
        heading={`on screen · ${onScreen.length}`}
        ids={onScreen}
        action="remove"
        showDesc={showDesc}
        onToggle={(id) => updateInstance(id, { hidden: true })}
      />
      <Section
        heading={`available · ${available.length}`}
        ids={available}
        action="add"
        showDesc={showDesc}
        onToggle={(id) => updateInstance(id, { hidden: false })}
        empty="every widget is on screen"
      />
    </div>
  );
}

function Section({
  heading,
  ids,
  action,
  showDesc,
  onToggle,
  empty,
}: {
  heading: string;
  ids: WidgetId[];
  action: "add" | "remove";
  showDesc: boolean;
  onToggle: (id: WidgetId) => void;
  empty?: string;
}) {
  return (
    <div className="wm-section">
      <div className="more-head">{heading}</div>
      {ids.length === 0 && empty ? (
        <div className="block-sub">{empty}</div>
      ) : (
        <div className="wm-list">
          {ids.map((id) => {
            const manifest: WidgetManifest = WIDGETS[id];
            const Icon = manifest.icon;
            const locked = LOCKED.includes(id);
            return (
              <div className="wm-item" key={id}>
                <Icon className="wm-item-icon" size={14} strokeWidth={1.75} />
                <div className="wm-item-text">
                  <span className="wm-item-title">{manifest.title}</span>
                  <span className="wm-item-id">#{id}</span>
                  {showDesc && manifest.detail && (
                    <span className="wm-item-desc">resize to L for more detail</span>
                  )}
                </div>
                <button
                  type="button"
                  className={`wm-btn wm-btn-${action}`}
                  disabled={locked}
                  onClick={() => onToggle(id)}
                  aria-label={`${action} ${manifest.title}`}
                  title={locked ? "the manager can't remove itself" : `${action} widget`}
                >
                  {locked ? (
                    <Lock size={12} strokeWidth={1.75} />
                  ) : action === "add" ? (
                    <Plus size={13} strokeWidth={2} />
                  ) : (
                    <Minus size={13} strokeWidth={2} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

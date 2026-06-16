"use client";
import "./WidgetManager.css";

// The widget manager — itself a widget, and the single surface for adding and
// removing widgets from the dashboard. Widgets already on screen can be
// removed (hidden); widgets not on screen can be added back. It can never hide
// itself (see ALWAYS_VISIBLE in lib/layout.ts), so there's always a way back.
//
// Per-size layout: S shows a compact count summary, M/L show the full
// add/remove gallery (L adds a one-line description of what each does).

import { useSyncExternalStore } from "react";
import { Lock, Minus, Plus } from "lucide-react";
import { DEFAULT_ORDER, WIDGETS, getManifest, type WidgetManifest } from "@/config/widgets";
import { CUSTOM_WIDGETS } from "@/config/customWidgets";
import { useWidget } from "@/components/framework/WidgetContext";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { getLayoutMode, getServerLayoutMode, subscribeLayoutMode } from "@/lib/layoutMode";
import { getSlotLayout, getServerSlotLayout, subscribeSlotLayout, placeWidgetAuto, removeWidget as removeSlotWidget } from "@/lib/slotLayout";

/** the widget manager can never remove itself — it's the only way to re-add
    hidden widgets (mirrors ALWAYS_VISIBLE in lib/layout.ts) */
const LOCKED: string[] = ["widgets"];

export function WidgetManager() {
  const { size } = useWidget();
  const { layout, updateInstance, addWidget } = useLayout();
  const layoutMode = useSyncExternalStore(subscribeLayoutMode, getLayoutMode, getServerLayoutMode);
  // always subscribe so server and client agree during hydration
  const slotLayout = useSyncExternalStore(subscribeSlotLayout, getSlotLayout, getServerSlotLayout);
  const isSlot = layoutMode === "slots";

  // keep a stable registry order regardless of current grid order;
  // include custom widgets after built-ins
  const byId = new Map(layout.widgets.map((w) => [w.id, w]));
  const allIds = [...DEFAULT_ORDER, ...Object.keys(CUSTOM_WIDGETS).filter((id) => !DEFAULT_ORDER.includes(id))];

  if (isSlot) {
    // derive placed/unplaced from the subscribed snapshot — never call getSlotLayout() in render
    const placedIds = new Set([
      ...slotLayout.widgets.map((w) => w.id),
      ...(slotLayout.terminalWidgetId ? [slotLayout.terminalWidgetId] : []),
    ]);
    const allKnownIds = [...Object.keys(WIDGETS), ...Object.keys(CUSTOM_WIDGETS).filter((id) => !(id in WIDGETS))];
    const unplacedIds = allKnownIds.filter((id) => !placedIds.has(id));
    const onScreenSlot = allIds.filter((id) => placedIds.has(id));
    const availableSlot = unplacedIds.filter((id) => allIds.includes(id) || id in CUSTOM_WIDGETS);

    if (size === "S") {
      return (
        <div className="wm-summary">
          <div className="block-stat">{onScreenSlot.length}</div>
          <div className="block-sub">placed · {availableSlot.length} unplaced</div>
        </div>
      );
    }

    return (
      <div className="wm">
        <Section
          heading={`placed · ${onScreenSlot.length}`}
          ids={onScreenSlot}
          action="remove"
          showDesc={size === "L"}
          onToggle={(id) => removeSlotWidget(id)}
        />
        <Section
          heading={`unplaced · ${availableSlot.length}`}
          ids={availableSlot}
          action="add"
          showDesc={size === "L"}
          onToggle={(id) => placeWidgetAuto(id)}
          empty="all widgets are placed"
          addHint="places in first available region"
        />
      </div>
    );
  }

  // Graph layout: tracked = in the layout store; untracked = in registry but layout was cached before it was generated
  const tracked = allIds.filter((id) => byId.has(id));
  const untracked = allIds.filter((id) => !byId.has(id));

  const onScreen = tracked.filter((id) => !byId.get(id)!.hidden);
  const available = [...tracked.filter((id) => byId.get(id)!.hidden), ...untracked];

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
        onToggle={(id) => (byId.has(id) ? updateInstance(id, { hidden: false }) : addWidget(id))}
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
  addHint,
}: {
  heading: string;
  ids: string[];
  action: "add" | "remove";
  showDesc: boolean;
  onToggle: (id: string) => void;
  empty?: string;
  addHint?: string;
}) {
  return (
    <div className="wm-section">
      <div className="more-head">{heading}{addHint && <span className="wm-hint"> · {addHint}</span>}</div>
      {ids.length === 0 && empty ? (
        <div className="block-sub">{empty}</div>
      ) : (
        <div className="wm-list">
          {ids.map((id) => {
            const manifest: WidgetManifest | undefined = getManifest(id);
            if (!manifest) return null;
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

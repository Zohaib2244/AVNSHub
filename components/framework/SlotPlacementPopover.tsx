"use client";

// Click-to-place picker for Slot Layout — opened from an empty cell
// (SlotRegion) or the empty terminal slot (SlotDashboard). Lists unplaced
// widgets that fit the target region (any widget fits the single-slot
// terminal); picking one commits via placeWidget/setTerminalWidget.

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { WIDGETS, type WidgetId } from "@/config/widgets";
import { minFootprint, type RegionId } from "@/config/slotLayout";
import { buildOccupancy, findFit } from "@/lib/grid/occupancy";
import { fuzzyFilter } from "@/lib/fuzzy";
import { getSlotLayout, getUnplacedWidgets, placeWidget, setTerminalWidget } from "@/lib/slotLayout";

export function SlotPlacementPopover({ region, onClose }: { region: RegionId; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onDown(e: PointerEvent) {
      const target = e.target as Element;
      // the empty-cell target toggles on click — closing here too would reopen it
      if (target.closest(".slot-cell-empty") || target.closest(".slot-terminal-empty")) return;
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

  const unplaced = getUnplacedWidgets();
  const slotLayout = getSlotLayout();
  const candidates =
    region === "terminal"
      ? unplaced
      : unplaced.filter((id) => {
          const dims = slotLayout.regionDims[region];
          const occupancy = buildOccupancy(
            dims,
            slotLayout.widgets
              .filter((w) => w.region === region)
              .map((w) => ({ col: w.col, row: w.row, colSpan: w.colSpan, rowSpan: w.rowSpan })),
          );
          return findFit(dims, occupancy, minFootprint(id)) !== null;
        });

  const filtered = fuzzyFilter(candidates, query, (id) => WIDGETS[id].title);

  function handlePick(id: WidgetId) {
    if (region === "terminal") setTerminalWidget(id);
    else placeWidget(id, region);
    onClose();
  }

  const anchorClass = region === "left" ? "slot-popover-left" : region === "right" ? "slot-popover-right" : "slot-popover-center";

  return (
    <div ref={panelRef} className={`slot-popover wset-panel ${anchorClass}`}>
      <div className="wset-head">
        <span className="wset-title">place widget</span>
        <button type="button" className="overlay-close" onClick={onClose} aria-label="close placement picker">
          <X size={11} strokeWidth={2} />
        </button>
      </div>

      {candidates.length === 0 ? (
        <div className="slot-popover-empty">nothing fits here</div>
      ) : (
        <>
          <div className="slot-popover-search">
            <input
              type="text"
              className="drawer-search"
              placeholder="search widgets..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
            <Search size={13} strokeWidth={1.75} className="slot-popover-search-icon" />
          </div>
          {filtered.length === 0 ? (
            <div className="slot-popover-empty">no matches for &ldquo;{query.trim()}&rdquo;</div>
          ) : (
            <div className="slot-popover-list">
              {filtered.map((id) => {
                const manifest = WIDGETS[id];
                const Icon = manifest.icon;
                return (
                  <button key={id} type="button" className="slot-popover-item" onClick={() => handlePick(id)}>
                    <Icon size={14} strokeWidth={1.75} />
                    {manifest.title}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

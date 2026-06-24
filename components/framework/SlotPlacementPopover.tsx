"use client";

// Click-to-place picker for Slot Layout — opened from an empty cell in any
// region (SlotRegion). Lists unplaced widgets that fit the target region;
// picking one commits via placeWidget.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { getManifest } from "@/config/widgets";
import { minFootprint, type SlotRegionId } from "@/config/slotLayout";
import { buildOccupancy, findFit } from "@/lib/grid/occupancy";
import { fuzzyFilter } from "@/lib/fuzzy";
import { getSlotLayout, getUnplacedWidgets, placeWidget } from "@/lib/slotLayout";

export function SlotPlacementPopover({
  region,
  onClose,
  preferredCell,
}: {
  region: SlotRegionId;
  onClose: () => void;
  preferredCell?: { col: number; row: number };
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  // keyboard-highlighted row; the top match starts selected so a plain Enter
  // after typing picks it
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    function onDown(e: PointerEvent) {
      const target = e.target as Element;
      // the empty-cell target toggles on click — closing here too would reopen it
      if (target.closest(".slot-cell-empty")) return;
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
  const candidates = unplaced.filter((id) => {
    const dims = slotLayout.regionDims[region];
    const occupancy = buildOccupancy(
      dims,
      slotLayout.widgets
        .filter((w) => w.region === region)
        .map((w) => ({ col: w.col, row: w.row, colSpan: w.colSpan, rowSpan: w.rowSpan })),
    );
    return findFit(dims, occupancy, minFootprint(id)) !== null;
  });

  const filtered = fuzzyFilter(candidates, query, (id) => getManifest(id)?.title ?? id);
  const clampedIndex = filtered.length ? Math.min(activeIndex, filtered.length - 1) : 0;

  // reset the highlight to the top match whenever the result set changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // keep the highlighted row scrolled into view as arrows move it
  useEffect(() => {
    itemRefs.current[clampedIndex]?.scrollIntoView({ block: "nearest" });
  }, [clampedIndex]);

  function handlePick(id: string) {
    placeWidget(id, region, preferredCell);
    onClose();
  }

  function handleSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(Math.min(clampedIndex + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(Math.max(clampedIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handlePick(filtered[clampedIndex]);
    }
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
              onKeyDown={handleSearchKeyDown}
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
              {filtered.map((id, i) => {
                const manifest = getManifest(id);
                if (!manifest) return null;
                const Icon = manifest.icon;
                return (
                  <button
                    key={id}
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    type="button"
                    className={`slot-popover-item${i === clampedIndex ? " active" : ""}`}
                    onClick={() => handlePick(id)}
                    onMouseMove={() => setActiveIndex(i)}
                  >
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

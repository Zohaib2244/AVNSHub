"use client";

// One Slot Layout region (left/right column or base) — a cols x rows CSS
// grid (dims from config/slotLayout.ts REGION_GRID) holding each placed
// widget's SlotWidgetCell at its persisted col/row/colSpan/rowSpan. In edit
// mode, every empty cell becomes a click target that opens
// SlotPlacementPopover for picking an unplaced widget.

import { useState } from "react";
import type { RegionDims, SlotRegionId } from "@/config/slotLayout";
import type { SlotWidgetInstance } from "@/lib/slotLayout";
import { buildOccupancy } from "@/lib/grid/occupancy";
import { useLayout } from "@/components/LayoutProvider";
import { SlotWidgetCell } from "@/components/framework/SlotWidgetCell";
import { SlotPlacementPopover } from "@/components/framework/SlotPlacementPopover";

export function SlotRegion({
  region,
  instances,
  dims,
}: {
  region: SlotRegionId;
  instances: SlotWidgetInstance[];
  dims: RegionDims;
}) {
  const { editMode } = useLayout();

  const emptyCells: { col: number; row: number }[] = [];
  if (editMode) {
    const occupancy = buildOccupancy(
      dims,
      instances.map((w) => ({ col: w.col, row: w.row, colSpan: w.colSpan, rowSpan: w.rowSpan })),
    );
    for (let r = 0; r < dims.rows; r++) {
      for (let c = 0; c < dims.cols; c++) {
        if (!occupancy[r][c]) emptyCells.push({ col: c, row: r });
      }
    }
  }

  return (
    <div
      className={`slot-region slot-region-${region}`}
      style={{
        gridTemplateColumns: `repeat(${dims.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${dims.rows}, minmax(0, 1fr))`,
      }}
    >
      {instances.map((instance) => (
        <SlotWidgetCell key={instance.id} instance={instance} />
      ))}
      {emptyCells.map((cell) => (
        <SlotEmptyCell key={`${cell.col}-${cell.row}`} region={region} cell={cell} />
      ))}
    </div>
  );
}

function SlotEmptyCell({ region, cell }: { region: SlotRegionId; cell: { col: number; row: number } }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="slot-cell-empty"
      style={{ gridColumn: `${cell.col + 1} / span 1`, gridRow: `${cell.row + 1} / span 1` }}
      role="button"
      tabIndex={0}
      aria-label={`place a widget in ${region}`}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
    >
      +{open && <SlotPlacementPopover region={region} onClose={() => setOpen(false)} />}
    </div>
  );
}

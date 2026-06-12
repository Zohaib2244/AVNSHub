"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { GripHorizontal, Settings2 } from "lucide-react";
import { SPAN_MAP, WIDGETS, type ExpandMode, type WidgetId, type WidgetManifest } from "@/config/widgets";
import type { WidgetInstance } from "@/lib/layout";
import { computeCascade, readGridRect, type CascadeOverride, type GridRect } from "@/lib/gridCascade";
import { useGridColumns } from "@/lib/useGridColumns";
import { useLayout } from "@/components/LayoutProvider";
import { WidgetShell } from "@/components/framework/WidgetShell";
import { WidgetSettingsPopover } from "@/components/framework/WidgetSettingsPopover";

/** mirrors WidgetShell's resolution: a mode is only honored when the widget
    ships expanded content or drives its own size tiers via "grow" */
function effectiveExpand(instance: WidgetInstance): ExpandMode {
  const manifest: WidgetManifest = WIDGETS[instance.id];
  return manifest.expandedComponent || manifest.expandModes.includes("grow") ? instance.expand : "none";
}

function spanStyle(instance: WidgetInstance, gridCols: number, cascade?: CascadeOverride) {
  const [cols, rows] = cascade ? [cascade.colSpan, cascade.rowSpan] : SPAN_MAP[`${instance.size}-${instance.orientation}`];
  const colSpan = Math.min(cols, gridCols);
  return {
    // an override may pin an explicit anchor (hovered widget) so dense
    // re-placement can't relocate it mid-hover; everything else stays auto
    gridColumn: cascade?.colStart != null ? `${cascade.colStart} / span ${colSpan}` : `span ${colSpan}`,
    gridRow:
      gridCols === 1 ? undefined : cascade?.rowStart != null ? `${cascade.rowStart} / span ${rows}` : `span ${rows}`,
  };
}

/** runs a state update inside a View Transition when the browser supports it,
    so widget span/position changes glide (compositor-level FLIP). Safe where
    JS layout-animation systems loop: nothing measures + setStates per item. */
function applyWithTransition(apply: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (doc.startViewTransition) doc.startViewTransition(() => flushSync(apply));
  else apply();
}

function GridWidget({
  instance,
  editMode,
  gridCols,
  slotRefs,
  cascade,
  grown,
  onHoverChange,
}: {
  instance: WidgetInstance;
  editMode: boolean;
  gridCols: number;
  slotRefs: { current: Map<WidgetId, HTMLDivElement> };
  cascade?: CascadeOverride;
  grown: boolean;
  onHoverChange: (id: WidgetId, hovering: boolean) => void;
}) {
  // no sortable transform strategy — with variable spans + dense flow the
  // grid itself reflows on live reorder; the DragOverlay carries the visual.
  // animateLayoutChanges MUST stay disabled: dnd-kit's layout animation
  // (useDerivedTransform) re-measures + setStates every sortable after each
  // reorder, and a dense reflow moves all of them — infinite update loop.
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: instance.id,
    disabled: !editMode,
    animateLayoutChanges: () => false,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!editMode && settingsOpen) setSettingsOpen(false);

  const manifest: WidgetManifest = WIDGETS[instance.id];
  const expandMode = effectiveExpand(instance);

  const setRefs = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    if (el) slotRefs.current.set(instance.id, el);
    else slotRefs.current.delete(instance.id);
  };

  return (
    <div
      ref={setRefs}
      className={`widget-slot${editMode ? " editing" : ""}${isDragging ? " dragging" : ""}`}
      // viewTransitionName lets the View Transitions API track each slot
      // individually, so override changes FLIP-animate per widget
      style={{ ...spanStyle(instance, gridCols, cascade), viewTransitionName: `widget-${instance.id}` }}
    >
      {editMode && (
        <>
          <button
            type="button"
            className="drag-handle"
            aria-label={`move ${instance.id} widget`}
            {...attributes}
            {...listeners}
          >
            <GripHorizontal size={12} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="gear-btn"
            aria-label={`configure ${instance.id} widget`}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings2 size={12} strokeWidth={1.75} />
          </button>
          {settingsOpen && (
            <WidgetSettingsPopover manifest={manifest} instance={instance} onClose={() => setSettingsOpen(false)} />
          )}
        </>
      )}
      <WidgetShell
        manifest={manifest}
        config={instance}
        cascade={cascade}
        grown={grown}
        onHoverChange={
          // "grow" hovers drive the cascade; "hover" (inline expand) claims an
          // extra row span so the expansion pushes rows below instead of
          // inflating its own row (which would stretch same-row neighbors)
          expandMode === "grow" || expandMode === "hover"
            ? (hovering) => onHoverChange(instance.id, hovering)
            : undefined
        }
      />
    </div>
  );
}

export function Dashboard() {
  const { layout, reorderWidget, editMode } = useLayout();
  const gridCols = useGridColumns();
  const [activeId, setActiveId] = useState<WidgetId | null>(null);
  const [hoveredId, setHoveredId] = useState<WidgetId | null>(null);
  const [overrides, setOverrides] = useState<Map<WidgetId, CascadeOverride>>(new Map());
  const slotRefs = useRef(new Map<WidgetId, HTMLDivElement>());
  // last (active, over) pair we reordered for — dedupes onDragOver storms so a
  // dense-reflow-triggered re-measure can't feed back into another reorder
  const lastOverPair = useRef<string | null>(null);

  // small activation distance so plain clicks on the handle don't start a drag
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const visible = layout.widgets.filter((w) => !w.hidden);
  const activeInstance = activeId ? visible.find((w) => w.id === activeId) : null;
  // signature of the cascade-relevant fields of `visible` — used as an
  // effect dependency so the cascade only recomputes when these actually change
  const visibleSig = visible.map((w) => `${w.id}:${w.size}:${w.orientation}`).join("|");
  // hover expansion is inert while rearranging — it would fight the drag
  const activeHoveredId = editMode ? null : hoveredId;
  // mirror of `overrides`, readable inside the deferred effect without a dep;
  // stays in sync because overrides is only ever written through commitOverrides
  const overridesRef = useRef<Map<WidgetId, CascadeOverride>>(new Map());
  const commitOverrides = useCallback((next: Map<WidgetId, CascadeOverride>) => {
    overridesRef.current = next;
    setOverrides(next);
  }, []);

  const handleHoverChange = useCallback((id: WidgetId, hovering: boolean) => {
    setHoveredId((current) => {
      if (hovering) return id;
      return current === id ? null : current;
    });
  }, []);

  // recompute the span overrides whenever the hovered widget, breakpoint, or
  // relevant widget placements change — deferred to a frame so the DOM has
  // settled (and setState doesn't run synchronously in the effect)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const hovered = activeHoveredId ? visible.find((w) => w.id === activeHoveredId) : undefined;
      if (!hovered) {
        if (overridesRef.current.size > 0) applyWithTransition(() => commitOverrides(new Map()));
        return;
      }

      const baseRect = (() => {
        const el = slotRefs.current.get(hovered.id);
        return el ? readGridRect(el) : null;
      })();

      if (effectiveExpand(hovered) === "hover") {
        // inline expand: claim one extra row so the expansion pushes the rows
        // below down (dense reflow) instead of inflating this widget's own
        // row, which would stretch every same-row neighbor; pinned to its
        // measured anchor so re-placement can't move it off the pointer
        const [cols, rows] = SPAN_MAP[`${hovered.size}-${hovered.orientation}`];
        applyWithTransition(() =>
          commitOverrides(
            new Map([
              [
                hovered.id,
                {
                  size: hovered.size,
                  colSpan: Math.min(cols, gridCols),
                  rowSpan: rows + 1,
                  micro: false,
                  colStart: baseRect?.colStart,
                  rowStart: baseRect?.rowStart,
                },
              ],
            ]),
          ),
        );
        return;
      }

      // "grow": full cascade — bump the hovered widget a tier, squeeze neighbors
      const rects = new Map<WidgetId, GridRect>();
      for (const w of visible) {
        const el = slotRefs.current.get(w.id);
        const rect = el ? readGridRect(el) : null;
        if (rect) rects.set(w.id, rect);
      }
      applyWithTransition(() => commitOverrides(computeCascade(hovered.id, visible, rects, gridCols)));
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleSig mirrors the parts of `visible` the overrides depend on
  }, [activeHoveredId, gridCols, visibleSig, commitOverrides]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as WidgetId);
    lastOverPair.current = null;
  }

  // reorder live while dragging so the grid reflows under the pointer
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const pairKey = `${active.id}:${over.id}`;
    if (lastOverPair.current === pairKey) return;
    lastOverPair.current = pairKey;
    reorderWidget(active.id as WidgetId, over.id as WidgetId);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={() => setActiveId(null)}
      onDragCancel={() => setActiveId(null)}
    >
      <div className={`mx-auto max-w-[1800px] px-5 py-6${editMode ? " layout-editing" : ""}`}>
        <div className="frame">
          <div className="frame-inner">
            <SortableContext items={visible.map((w) => w.id)} strategy={() => null}>
              <div className="widget-grid">
                {visible.map((instance) => (
                  <GridWidget
                    key={instance.id}
                    instance={instance}
                    editMode={editMode}
                    gridCols={gridCols}
                    slotRefs={slotRefs}
                    cascade={overrides.get(instance.id)}
                    grown={instance.id === activeHoveredId}
                    onHoverChange={handleHoverChange}
                  />
                ))}
              </div>
            </SortableContext>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeInstance && (
          <div className="widget-slot drag-preview">
            <WidgetShell manifest={WIDGETS[activeInstance.id]} config={activeInstance} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

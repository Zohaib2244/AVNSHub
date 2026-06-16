"use client";

import { useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
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
import { GripHorizontal } from "lucide-react";
import { SPAN_MAP, getManifest, type WidgetManifest } from "@/config/widgets";
import type { WidgetId } from "@/config/widgets";
import type { WidgetInstance } from "@/lib/layout";
import { useGridColumns } from "@/lib/useGridColumns";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { WidgetShell } from "@/components/framework/WidgetShell";
import { WidgetSettingsPopover } from "@/components/framework/WidgetSettingsPopover";

/** size × orientation → grid spans (column span clamped to the live column
    count so a wide widget never overflows a narrow breakpoint) */
function spanStyle(instance: WidgetInstance, gridCols: number) {
  const [cols, rows] = SPAN_MAP[`${instance.size}-${instance.orientation}`];
  const colSpan = Math.min(cols, gridCols);
  return {
    gridColumn: `span ${colSpan}`,
    // single-column breakpoints stack everything; row spans would leave gaps
    gridRow: gridCols === 1 ? undefined : `span ${rows}`,
  };
}

function GridWidget({
  instance,
  editMode,
  gridCols,
  slotRefs,
}: {
  instance: WidgetInstance;
  editMode: boolean;
  gridCols: number;
  slotRefs: { current: Map<string, HTMLDivElement> };
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
  // open-state is shared via LayoutProvider so opening one widget's settings
  // auto-closes any other that was open
  const { activePopover, setActivePopover } = useLayout();
  const popoverKey = `settings:${instance.id}`;
  const settingsOpen = activePopover === popoverKey;

  const manifest: WidgetManifest | undefined = getManifest(instance.id);
  if (!manifest) return null;

  const setRefs = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    if (el) slotRefs.current.set(instance.id, el);
    else slotRefs.current.delete(instance.id);
  };

  return (
    <div
      ref={setRefs}
      className={`widget-slot${editMode ? " editing" : ""}${isDragging ? " dragging" : ""}`}
      style={spanStyle(instance, gridCols)}
    >
      {editMode && (
        <button
          type="button"
          className="drag-handle"
          aria-label={`move ${instance.id} widget`}
          {...attributes}
          {...listeners}
        >
          <GripHorizontal size={12} strokeWidth={1.75} />
        </button>
      )}
      <button
        type="button"
        className={`settings-tab${settingsOpen ? " open" : ""}`}
        aria-label={`configure ${instance.id} widget`}
        onClick={() => setActivePopover(settingsOpen ? null : popoverKey)}
      />
      <AnimatePresence>
        {settingsOpen && (
          <WidgetSettingsPopover
            key="graph-settings"
            manifest={manifest}
            instance={instance}
            onClose={() => setActivePopover(null)}
          />
        )}
      </AnimatePresence>
      <WidgetShell manifest={manifest} config={instance} />
    </div>
  );
}

export function Dashboard() {
  const { layout, reorderWidget, editMode } = useLayout();
  const gridCols = useGridColumns();
  const [activeId, setActiveId] = useState<string | null>(null);
  const slotRefs = useRef(new Map<string, HTMLDivElement>());
  // last (active, over) pair we reordered for — dedupes onDragOver storms so a
  // dense-reflow-triggered re-measure can't feed back into another reorder
  const lastOverPair = useRef<string | null>(null);

  // small activation distance so plain clicks on the handle don't start a drag
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const visible = layout.widgets.filter((w) => !w.hidden);
  const activeInstance = activeId ? visible.find((w) => w.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
    lastOverPair.current = null;
  }

  // reorder live while dragging so the grid reflows under the pointer
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const pairKey = `${active.id}:${over.id}`;
    if (lastOverPair.current === pairKey) return;
    lastOverPair.current = pairKey;
    reorderWidget(active.id as string, over.id as string);
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
            {getManifest(activeInstance.id) && (
              <WidgetShell manifest={getManifest(activeInstance.id)!} config={activeInstance} />
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

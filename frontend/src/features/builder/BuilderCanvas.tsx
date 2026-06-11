import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState } from "react";
import { CanvasList } from "./CanvasList";
import { findElement } from "./model";

/** Where a droppable lives in the tree; attached as dnd-kit `data` on items and zones. */
export interface DropLocation {
  pageIndex: number;
  parentName?: string;
  index: number;
}

/**
 * The drag-and-drop context for the builder canvas. One DndContext spans the whole page
 * tree, so elements can be reordered in place, dragged into and out of groups/repeats,
 * and dropped onto empty containers. The actual move is committed once, on drop —
 * keeping undo history at one entry per drag.
 */
export function BuilderCanvas({
  elements,
  selectedName,
  pageIndex,
}: {
  elements: Element[];
  selectedName: string | null;
  pageIndex: number;
}) {
  const schema = useBuilderStore((s) => s.schema);
  const moveInto = useBuilderStore((s) => s.moveInto);
  const select = useBuilderStore((s) => s.select);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [overName, setOverName] = useState<string | null>(null);

  const sensors = useSensors(
    // Distance threshold keeps plain clicks (select, buttons) from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(e: DragStartEvent) {
    const name = String(e.active.id);
    setActiveName(name);
    select(name);
  }

  function handleDragOver(e: DragOverEvent) {
    setOverName(e.over ? String(e.over.id) : null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveName(null);
    setOverName(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const name = String(active.id);
    const overId = String(over.id);

    // Empty-container / end-of-list zones carry their target location as data.
    if (overId.startsWith("zone:")) {
      const loc = over.data.current as DropLocation | undefined;
      if (loc) moveInto(name, { pageIndex: loc.pageIndex, parentName: loc.parentName }, loc.index);
      return;
    }

    // Dropped on another element: take its place in that element's sibling list.
    const loc = over.data.current?.location as DropLocation | undefined;
    if (loc) moveInto(name, { pageIndex: loc.pageIndex, parentName: loc.parentName }, loc.index);
  }

  const active = activeName ? findElement(schema, activeName) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveName(null);
        setOverName(null);
      }}
    >
      <CanvasList
        elements={elements}
        selectedName={selectedName}
        pageIndex={pageIndex}
        activeName={activeName}
        overName={overName}
      />

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.3,1)" }}>
        {active ? (
          <div className="el-card drag-ghost">
            <div className="el-row">
              <span className="drag-handle" aria-hidden="true">
                ⋮⋮
              </span>
              <span className="el-card-body">
                <span className="el-label">{localize(active.label) || active.name}</span>
                <span className="el-type">{active.type.replace(/_/g, " ")}</span>
              </span>
              {active.elements?.length ? (
                <span className="drag-count">{active.elements.length} inside</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

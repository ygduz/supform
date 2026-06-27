import { useBuilderStore } from "@/stores/builderStore";
import type { ElementType } from "@/types/form-schema";
import {
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useRef, useState } from "react";
import type { DropLocation } from "./BuilderCanvas";
import { findElement, isContainerType } from "./model";

/** Rightward drag distance (px) that turns a card-on-card drop into a grouping action. */
const GROUP_NUDGE_PX = 48;

/**
 * Encapsulates all drag-and-drop wiring for the builder canvas + palette: sensors,
 * pointer-first collision detection, the active/over drag ids (for the overlay and cues),
 * and the start/over/end handlers — including the rightward-nudge "drag-to-group" gesture.
 *
 * Kept out of BuilderPage so the page component is just composition + render.
 */
export function useBuilderDrag() {
  const store = useBuilderStore();
  const schema = store.schema;

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overDragId, setOverDragId] = useState<string | null>(null);

  // Pointer position where the drag began (from the activator pointerdown). The drag end
  // event omits pointer coords, so we reconstruct the live pointer as start + delta.
  const dragStartPoint = useRef<{ x: number; y: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Pointer-first collision detection: what's directly under the cursor wins. This makes
  // dropping a question *out* of a section (onto the page-level drop zone or another
  // top-level card) reliable — closestCorners alone tends to snap back to the nested
  // SortableContext whose rect overlaps the pointer. Falls back to rect-based strategies
  // when the pointer isn't over any droppable (e.g. fast drags past the edge).
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const byPointer = pointerWithin(args);
    if (byPointer.length > 0) return byPointer;
    const byRect = rectIntersection(args);
    if (byRect.length > 0) return byRect;
    return closestCorners(args);
  }, []);

  /**
   * The question card a release would GROUP with, or null when the drop should reorder.
   *
   * Grouping intent is a *rightward nudge* onto another card (like indent-to-nest in an
   * outliner). We key off horizontal drag distance rather than a vertical "centre band"
   * because dnd-kit's sortable shifts cards vertically under the cursor mid-drag, which
   * makes any vertical hit-test unreliable — horizontal delta is unaffected by that shift.
   * The target card is hit-tested from the live pointer (activator event + delta).
   */
  const groupDropTarget = useCallback(
    (e: DragOverEvent | DragEndEvent): string | null => {
      const activeId = String(e.active.id);
      if (activeId.startsWith("palette:")) return null;
      if (e.delta.x < GROUP_NUDGE_PX) return null; // not a deliberate sideways nudge → reorder
      const start = dragStartPoint.current;
      if (!start) return null;
      const x = start.x + e.delta.x;
      const y = start.y + e.delta.y;
      const card = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(
        "[data-el-name]",
      );
      const name = card?.dataset.elName;
      if (!card || !name || name === activeId) return null;
      const overEl = findElement(schema, name);
      if (!overEl || isContainerType(overEl.type)) return null;
      return name;
    },
    [schema],
  );

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveDragId(id);
    const ae = e.activatorEvent as { clientX?: number; clientY?: number };
    dragStartPoint.current =
      ae.clientX !== undefined && ae.clientY !== undefined
        ? { x: ae.clientX, y: ae.clientY }
        : null;
    // Select the element being dragged (not for palette items).
    if (!id.startsWith("palette:")) store.select(id);
  }

  function handleDragOver(e: DragOverEvent) {
    setOverDragId(e.over ? String(e.over.id) : null);
    // Broadcast whether releasing now would GROUP, so the hovered card shows the cue.
    const target = groupDropTarget(e);
    store.setDropTarget(target, target ? "group" : "move");
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    setOverDragId(null);
    store.setDropTarget(null, null);
    const { active, over } = e;
    const activeId = String(active.id);

    // Drag-to-group: a rightward nudge onto another question groups them (or, when the
    // target lives in a section, drops the dragged card into that section). Checked before
    // the `over` guard so a drop onto a nested child (which can yield over=null) still works.
    const groupTarget = groupDropTarget(e);
    if (groupTarget) {
      store.groupOrJoin(activeId, groupTarget);
      return;
    }

    if (!over) return;
    const overId = String(over.id);

    // Zones store their location directly; element cards store it under `location`.
    const data = over.data.current as (DropLocation & { location?: DropLocation }) | undefined;
    let loc: DropLocation | undefined =
      data?.location ?? (data?.pageIndex !== undefined ? data : undefined);
    if (!loc) return;

    // Dropping onto a section card means "into the section" (appended at the end),
    // unless the dragged item is already a direct child of that section.
    const overEl = findElement(schema, overId);
    if (overEl && isContainerType(overEl.type)) {
      const isOwnChild = overEl.elements?.some((c) => c.name === activeId) ?? false;
      if (!isOwnChild && overId !== activeId) {
        loc = {
          pageIndex: loc.pageIndex,
          parentName: overEl.name,
          index: overEl.elements?.length ?? 0,
        };
      }
    }

    if (activeId.startsWith("palette:")) {
      // Palette drag → insert new element at the drop target's position.
      const type = activeId.slice("palette:".length) as ElementType;
      store.addAt(type, { pageIndex: loc.pageIndex, parentName: loc.parentName }, loc.index);
      return;
    }

    if (activeId === overId) return;

    // Edge-of-card drops reorder; centre-of-card drops are handled by the grouping branch
    // above. The overflow-menu "Group with another" action remains as a keyboard-free path.
    store.moveInto(activeId, { pageIndex: loc.pageIndex, parentName: loc.parentName }, loc.index);
  }

  function handleDragCancel() {
    setActiveDragId(null);
    setOverDragId(null);
    dragStartPoint.current = null;
    store.setDropTarget(null, null);
  }

  return {
    sensors,
    collisionDetection,
    activeDragId,
    overDragId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  };
}

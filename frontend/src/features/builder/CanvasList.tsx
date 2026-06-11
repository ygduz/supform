import type { Element } from "@/types/form-schema";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { DropLocation } from "./BuilderCanvas";
import { ElementCard } from "./ElementCard";

/**
 * One sortable list of sibling elements (a page's top level or a container's children).
 * Container elements recurse — an ElementCard renders a nested CanvasList — and the shared
 * DndContext in BuilderCanvas lets drags cross list boundaries (into/out of groups).
 */
export function CanvasList({
  elements,
  selectedName,
  pageIndex,
  parentName,
  activeName,
  overName,
}: {
  elements: Element[];
  selectedName: string | null;
  pageIndex: number;
  parentName?: string;
  activeName: string | null;
  overName: string | null;
}) {
  return (
    <SortableContext items={elements.map((e) => e.name)} strategy={verticalListSortingStrategy}>
      <ol className="el-list">
        {elements.map((el, i) => (
          <ElementCard
            key={el.name}
            element={el}
            index={i}
            count={elements.length}
            location={{ pageIndex, parentName, index: i }}
            selected={el.name === selectedName}
            selectedName={selectedName}
            activeName={activeName}
            overName={overName}
          />
        ))}
      </ol>
      {/* Tail zone: drop below the last card to append (also the whole area of an empty list). */}
      <DropZone
        id={`zone:${parentName ?? `page-${pageIndex}`}`}
        location={{ pageIndex, parentName, index: elements.length }}
        empty={elements.length === 0}
        dragging={activeName !== null}
        over={overName === `zone:${parentName ?? `page-${pageIndex}`}`}
        label={parentName ? "Drop here to add to this group" : "Drop here"}
      />
    </SortableContext>
  );
}

function DropZone({
  id,
  location,
  empty,
  dragging,
  over,
  label,
}: {
  id: string;
  location: DropLocation;
  empty: boolean;
  dragging: boolean;
  over: boolean;
  label: string;
}) {
  const { setNodeRef } = useDroppable({ id, data: location });
  const cls = ["drop-zone", empty ? "empty" : "", dragging ? "armed" : "", over ? "over" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div ref={setNodeRef} className={cls}>
      {dragging || empty ? <span>{label}</span> : null}
    </div>
  );
}

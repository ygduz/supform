import type { Element } from "@/types/form-schema";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Fragment } from "react";
import type { DropLocation } from "./BuilderCanvas";
import { ElementCard } from "./ElementCard";
import { InsertSlot } from "./InsertSlot";

export function CanvasList({
  elements,
  selectedName,
  selectedNames,
  pageIndex,
  parentName,
  activeDragId,
  overDragId,
  groupingSource,
  onGroupLink,
}: {
  elements: Element[];
  selectedName: string | null;
  selectedNames: Set<string>;
  pageIndex: number;
  parentName?: string;
  activeDragId: string | null;
  overDragId: string | null;
  groupingSource: string | null;
  onGroupLink: (name: string) => void;
}) {
  return (
    <SortableContext items={elements.map((e) => e.name)} strategy={verticalListSortingStrategy}>
      <ol className="el-list">
        {elements.map((el, i) => (
          <Fragment key={el.name}>
            {/* Hover-to-insert gap; hidden while a drag is in flight to keep drops clean. */}
            {activeDragId === null && <InsertSlot location={{ pageIndex, parentName, index: i }} />}
            <ElementCard
              element={el}
              index={i}
              count={elements.length}
              location={{ pageIndex, parentName, index: i }}
              selected={el.name === selectedName}
              inSelection={selectedNames.has(el.name)}
              multiSelect={selectedNames.size > 1}
              selectedName={selectedName}
              selectedNames={selectedNames}
              activeDragId={activeDragId}
              overDragId={overDragId}
              groupingSource={groupingSource}
              onGroupLink={onGroupLink}
            />
          </Fragment>
        ))}
      </ol>
      <DropZone
        id={`zone:${parentName ?? `page-${pageIndex}`}`}
        location={{ pageIndex, parentName, index: elements.length }}
        empty={elements.length === 0}
        dragging={activeDragId !== null}
        over={overDragId === `zone:${parentName ?? `page-${pageIndex}`}`}
        label={parentName ? "Drop here to add to this group" : "Drop here"}
      />
      {/* Always-visible add control at the bottom of the list (hidden mid-drag). */}
      {activeDragId === null && elements.length > 0 && (
        <InsertSlot
          variant="block"
          location={{ pageIndex, parentName, index: elements.length }}
          label={parentName ? "Add question to group" : "Add question"}
        />
      )}
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

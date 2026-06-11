import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DropLocation } from "./BuilderCanvas";
import { CanvasList } from "./CanvasList";
import { isContainerType } from "./model";

interface Props {
  element: Element;
  index: number;
  count: number;
  location: DropLocation;
  selected: boolean;
  selectedName: string | null;
  activeName: string | null;
  overName: string | null;
}

/** A single question in the builder canvas: selectable, draggable, removable, nestable. */
export function ElementCard({
  element,
  index,
  count,
  location,
  selected,
  selectedName,
  activeName,
  overName,
}: Props) {
  const { select, remove, duplicate, moveBy } = useBuilderStore();
  const container = isContainerType(element.type);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: element.name,
    data: { location },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const cls = [
    "el-card",
    selected ? "selected" : "",
    isDragging ? "dragging" : "",
    // Insertion hint when a drag from elsewhere hovers this card.
    overName === element.name && activeName && activeName !== element.name ? "drop-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li ref={setNodeRef} style={style} className={cls}>
      <div className="el-row" {...attributes} {...listeners}>
        <span className="drag-handle" aria-hidden="true">
          ⋮⋮
        </span>

        <button type="button" className="el-card-body" onClick={() => select(element.name)}>
          <span className="el-label">{localize(element.label) || element.name}</span>
          <span className="el-type">{element.type.replace(/_/g, " ")}</span>
        </button>

        <div className="el-actions">
          <button
            type="button"
            title="Move up"
            disabled={index === 0}
            onClick={() => moveBy(element.name, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            title="Move down"
            disabled={index === count - 1}
            onClick={() => moveBy(element.name, 1)}
          >
            ↓
          </button>
          <button type="button" title="Duplicate" onClick={() => duplicate(element.name)}>
            ⧉
          </button>
          <button type="button" title="Delete" onClick={() => remove(element.name)}>
            🗑
          </button>
        </div>
      </div>

      {container && (
        <div className="el-children">
          <CanvasList
            elements={element.elements ?? []}
            selectedName={selectedName}
            pageIndex={location.pageIndex}
            parentName={element.name}
            activeName={activeName}
            overName={overName}
          />
        </div>
      )}
    </li>
  );
}

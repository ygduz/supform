import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { CanvasList } from "./CanvasList";
import { isContainerType } from "./model";

interface Props {
  element: Element;
  index: number;
  count: number;
  selected: boolean;
  selectedName: string | null;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}

/** A single question in the builder canvas: selectable, reorderable, removable, nestable. */
export function ElementCard({
  element,
  index,
  count,
  selected,
  selectedName,
  onDragStart,
  onDragOver,
  onDrop,
}: Props) {
  const { select, remove, duplicate, moveBy } = useBuilderStore();
  const container = isContainerType(element.type);

  return (
    <li className={selected ? "el-card selected" : "el-card"}>
      <div
        className="el-row"
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
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
          {(element.elements ?? []).length === 0 ? (
            <p className="muted nested-empty">
              Empty {element.type}. Select it, then add questions from the palette.
            </p>
          ) : (
            <CanvasList elements={element.elements ?? []} selectedName={selectedName} />
          )}
        </div>
      )}
    </li>
  );
}

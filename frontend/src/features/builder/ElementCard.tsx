import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";

interface Props {
  element: Element;
  index: number;
  count: number;
  selected: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}

/** A single question as shown in the builder canvas: selectable, reorderable, removable. */
export function ElementCard({
  element,
  index,
  count,
  selected,
  onDragStart,
  onDragOver,
  onDrop,
}: Props) {
  const { select, remove, duplicate, moveBy } = useBuilderStore();

  return (
    <li
      className={selected ? "el-card selected" : "el-card"}
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
    </li>
  );
}

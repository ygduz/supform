import { useBuilderStore } from "@/stores/builderStore";
import type { ElementType } from "@/types/form-schema";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

/** A palette button that both clicks-to-append AND drags onto the canvas at a specific slot. */
export function PaletteItem({
  type,
  label,
  icon,
}: {
  type: ElementType;
  label: string;
  icon: string;
}) {
  const add = useBuilderStore((s) => s.add);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { type },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`palette-item${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform) }}
      onClick={() => add(type)}
      {...listeners}
      {...attributes}
    >
      <span aria-hidden="true">{icon}</span> {label}
    </button>
  );
}

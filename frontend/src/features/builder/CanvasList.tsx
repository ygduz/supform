import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { useRef } from "react";
import { ElementCard } from "./ElementCard";

/**
 * Renders one list of sibling elements with drag-to-reorder scoped to that list.
 * Container elements recurse (an ElementCard renders a nested CanvasList), so groups and
 * repeats nest arbitrarily while reordering never crosses a parent boundary.
 */
export function CanvasList({
  elements,
  selectedName,
}: {
  elements: Element[];
  selectedName: string | null;
}) {
  const moveTo = useBuilderStore((s) => s.moveTo);
  const dragName = useRef<string | null>(null);

  function handleDrop(targetName: string) {
    const source = dragName.current;
    dragName.current = null;
    if (!source || source === targetName) return;
    // Only reorder when both are in this list (drags from other lists won't match).
    if (!elements.some((e) => e.name === source)) return;
    const targetIndex = elements.findIndex((e) => e.name === targetName);
    moveTo(source, targetIndex);
  }

  return (
    <ol className="el-list">
      {elements.map((el, i) => (
        <ElementCard
          key={el.name}
          element={el}
          index={i}
          count={elements.length}
          selected={el.name === selectedName}
          selectedName={selectedName}
          onDragStart={() => {
            dragName.current = el.name;
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(el.name)}
        />
      ))}
    </ol>
  );
}

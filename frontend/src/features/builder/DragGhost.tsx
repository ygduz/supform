import { localize } from "@/lib/i18n";
import type { Element } from "@/types/form-schema";
import type { ReactNode } from "react";

interface PaletteGhost {
  icon: ReactNode;
  label: string;
}

/**
 * The floating ghost shown inside dnd-kit's DragOverlay while dragging — either a palette
 * item (about to be inserted) or an existing canvas element (being reordered/grouped).
 */
export function DragGhost({
  paletteItem,
  canvasElement,
}: {
  paletteItem: PaletteGhost | null | undefined;
  canvasElement: Element | null;
}) {
  if (paletteItem) {
    return (
      <div className="palette-item drag-ghost">
        <span aria-hidden="true">{paletteItem.icon}</span> {paletteItem.label}
      </div>
    );
  }
  if (canvasElement) {
    return (
      <div className="el-card drag-ghost">
        <div className="el-row">
          <span className="drag-handle" aria-hidden="true">
            ⋮⋮
          </span>
          <span className="el-card-body">
            <span className="el-label">{localize(canvasElement.label) || canvasElement.name}</span>
            <span className="el-type">{canvasElement.type.replace(/_/g, " ")}</span>
          </span>
          {canvasElement.elements?.length ? (
            <span className="drag-count">{canvasElement.elements.length} inside</span>
          ) : null}
        </div>
      </div>
    );
  }
  return null;
}

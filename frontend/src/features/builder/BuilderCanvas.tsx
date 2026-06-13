import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { BulkActionBar } from "./BulkActionBar";
import { CanvasList } from "./CanvasList";

/** Where a droppable lives in the tree; shared by CanvasList/ElementCard and BuilderPage. */
export interface DropLocation {
  pageIndex: number;
  parentName?: string;
  index: number;
}

/**
 * Canvas rendering layer — no DndContext here (lives in BuilderPage so the palette and
 * canvas share one context). Renders the sortable lists, the bulk-action bar, and the
 * group-link mode hint banner.
 */
export function BuilderCanvas({
  elements,
  pageIndex,
  activeDragId,
  overDragId,
  groupingSource,
  onGroupLink,
}: {
  elements: Element[];
  pageIndex: number;
  activeDragId: string | null;
  overDragId: string | null;
  groupingSource: string | null;
  onGroupLink: (targetName: string) => void;
}) {
  const { selectedName, selectedNames } = useBuilderStore();
  const multiCount = selectedNames.size;

  return (
    <div className="canvas-inner">
      {groupingSource && (
        <div className="group-link-hint">
          Click another question to group it with this one — or press <kbd>Esc</kbd> to cancel.
        </div>
      )}

      <CanvasList
        elements={elements}
        selectedName={selectedName}
        selectedNames={selectedNames}
        pageIndex={pageIndex}
        activeDragId={activeDragId}
        overDragId={overDragId}
        groupingSource={groupingSource}
        onGroupLink={onGroupLink}
      />

      {multiCount >= 2 && <BulkActionBar count={multiCount} />}
    </div>
  );
}

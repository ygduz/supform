import { useBuilderStore } from "@/stores/builderStore";

/**
 * Sticky bar that appears at the bottom of the canvas when ≥ 2 questions are selected.
 * All actions operate on the full `selectedNames` set and produce a single undo entry.
 */
export function BulkActionBar({ count }: { count: number }) {
  const { groupSelected, duplicateSelected, removeSelected, setRequiredSelected, clearSelection } =
    useBuilderStore();

  return (
    <div className="bulk-bar">
      <span className="bulk-count">{count} selected</span>

      <div className="bulk-actions">
        <button
          type="button"
          className="bulk-btn"
          title="Group into a section (Ctrl+G)"
          onClick={groupSelected}
        >
          <span aria-hidden="true">⊞</span> Group
        </button>
        <button
          type="button"
          className="bulk-btn"
          title="Duplicate all selected"
          onClick={duplicateSelected}
        >
          <span aria-hidden="true">⧉</span> Duplicate
        </button>
        <button
          type="button"
          className="bulk-btn"
          title="Make all required"
          onClick={() => setRequiredSelected(true)}
        >
          <span aria-hidden="true">★</span> Required
        </button>
        <button
          type="button"
          className="bulk-btn"
          title="Make all optional"
          onClick={() => setRequiredSelected(false)}
        >
          <span aria-hidden="true">☆</span> Optional
        </button>
        <button
          type="button"
          className="bulk-btn bulk-btn-danger"
          title="Delete all selected (Delete key)"
          onClick={removeSelected}
        >
          <span aria-hidden="true">🗑</span> Delete
        </button>
      </div>

      <button
        type="button"
        className="bulk-close"
        title="Clear selection (Esc)"
        onClick={clearSelection}
      >
        ✕
      </button>
    </div>
  );
}

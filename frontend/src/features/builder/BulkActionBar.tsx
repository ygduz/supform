import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { buildConnectorExpression } from "./connectors";

/**
 * Sticky bar that appears at the bottom of the canvas when ≥ 2 questions are selected.
 * All actions operate on the full `selectedNames` set and produce a single undo entry.
 */
export function BulkActionBar({ count }: { count: number }) {
  const {
    groupSelected,
    duplicateSelected,
    removeSelected,
    setRequiredSelected,
    clearSelection,
    selectedNames,
    schema,
    update,
  } = useBuilderStore();

  // With exactly 2 selected, offer a one-click shortcut that wires up the same
  // "show second question when the first has any answer" logic the ⚡ connector
  // drag produces — picking the first non-empty option/value as the trigger.
  function linkLogic() {
    const [fromName, toName] = [...selectedNames];
    if (!fromName || !toName) return;
    const findEl = (els: Element[]): Element | null => {
      for (const el of els) {
        if (el.name === fromName) return el;
        if (el.elements) {
          const found = findEl(el.elements);
          if (found) return found;
        }
      }
      return null;
    };
    const fromEl = findEl(schema.pages.flatMap((p) => p.elements));
    const value = fromEl?.options?.[0]?.value ?? true;
    update(toName, { visibleIf: buildConnectorExpression(fromName, "==", value) });
    clearSelection();
  }

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
        {count === 2 && (
          <button
            type="button"
            className="bulk-btn"
            title="Show the second question only when the first is answered"
            onClick={linkLogic}
          >
            <span aria-hidden="true">⚡</span> Link logic
          </button>
        )}
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

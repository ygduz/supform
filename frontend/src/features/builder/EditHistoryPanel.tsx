import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element, FormSchema } from "@/types/form-schema";

/** Total number of elements (including nested group/repeat children) in a snapshot. */
function countFields(schema: FormSchema): number {
  let n = 0;
  const walk = (els: Element[]) => {
    for (const el of els) {
      n++;
      if (el.elements) walk(el.elements);
    }
  };
  for (const p of schema.pages) walk(p.elements);
  return n;
}

/**
 * Edit-history timeline — a git-like list of every in-session snapshot. Clicking any point
 * reverts the canvas to exactly how it looked then; you can jump forward again afterwards,
 * so nothing is destroyed. Backed by the builder store's undo/redo snapshot stack.
 */
export function EditHistoryPanel() {
  const past = useBuilderStore((s) => s.past);
  const future = useBuilderStore((s) => s.future);
  const schema = useBuilderStore((s) => s.schema);
  const jumpTo = useBuilderStore((s) => s.jumpTo);

  const timeline = [...past, schema, ...future];
  const currentIndex = past.length;

  if (timeline.length <= 1) {
    return (
      <div className="edit-history">
        <p className="edit-history-intro">
          Every change you make is recorded here. Start editing and you'll be able to jump back to
          any earlier point — like steps in a project's history.
        </p>
        <p className="muted">No edits yet.</p>
      </div>
    );
  }

  // Newest at the top.
  const rows = timeline.map((snap, i) => ({ snap, i })).reverse();

  return (
    <div className="edit-history">
      <p className="edit-history-intro">
        Click any point to revert the canvas to exactly how it looked then. Nothing is lost — you
        can jump forward again.
      </p>
      <ol className="edit-history-list">
        {rows.map(({ snap, i }) => {
          const isCurrent = i === currentIndex;
          const isFuture = i > currentIndex;
          const fields = countFields(snap);
          const title = localize(snap.title) || "Untitled form";
          const label = isCurrent ? "Current" : i === timeline.length - 1 ? "Latest" : `Step ${i}`;
          return (
            <li
              key={i}
              className={`eh-row${isCurrent ? " current" : ""}${isFuture ? " future" : ""}`}
            >
              <span className="eh-dot" aria-hidden="true" />
              <button
                type="button"
                className="eh-entry"
                disabled={isCurrent}
                onClick={() => jumpTo(i)}
                title={isCurrent ? "This is the current state" : "Revert to this point"}
              >
                <span className="eh-label">{label}</span>
                <span className="eh-meta">
                  {title} · {fields} {fields === 1 ? "field" : "fields"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

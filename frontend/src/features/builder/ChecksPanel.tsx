import { useBuilderStore } from "@/stores/builderStore";
import { type FormNote, lintForm } from "./lint";

/**
 * Live "Checks" panel: surfaces the form-checker's notes (dangling references, logic that
 * can never fire, stale option references, circular calculations, …). Click a note to jump
 * to the question it concerns. Errors are listed first.
 */
export function ChecksPanel() {
  const schema = useBuilderStore((s) => s.schema);
  const select = useBuilderStore((s) => s.select);
  const notes = lintForm(schema);

  if (notes.length === 0) {
    return (
      <div className="props checks-panel">
        <p className="checks-empty">✓ No issues found — your form looks good.</p>
      </div>
    );
  }

  const errors = notes.filter((n) => n.level === "error").length;
  const warnings = notes.length - errors;

  return (
    <div className="props checks-panel">
      <p className="checks-summary">
        {errors > 0 && (
          <span className="checks-count error">
            {errors} error{errors === 1 ? "" : "s"}
          </span>
        )}
        {warnings > 0 && (
          <span className="checks-count warning">
            {warnings} suggestion{warnings === 1 ? "" : "s"}
          </span>
        )}
      </p>
      <ul className="checks-list">
        {notes.map((note, i) => (
          <NoteRow
            key={`${note.code}-${note.elementName ?? ""}-${i}`}
            note={note}
            onJump={select}
          />
        ))}
      </ul>
    </div>
  );
}

function NoteRow({ note, onJump }: { note: FormNote; onJump: (name: string) => void }) {
  const clickable = Boolean(note.elementName);
  return (
    <li className={`check-note ${note.level}`}>
      <button
        type="button"
        className="check-note-btn"
        disabled={!clickable}
        onClick={() => note.elementName && onJump(note.elementName)}
      >
        <span className="check-icon" aria-hidden="true">
          {note.level === "error" ? "⛔" : "⚠️"}
        </span>
        <span className="check-msg">{note.message}</span>
        {clickable && (
          <span className="check-jump" aria-hidden="true">
            ↗
          </span>
        )}
      </button>
    </li>
  );
}

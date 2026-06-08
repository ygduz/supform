import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import { FormRenderer } from "../renderer/FormRenderer";
import { ELEMENT_PALETTE } from "./palette";

/**
 * The form builder. Scaffold layout: a palette of question types (left), the editable
 * form canvas (center), and a live preview (right). Drag-and-drop wiring lands in M2.
 */
export function BuilderPage() {
  const { schema, addElement } = useBuilderStore();

  return (
    <div className="builder">
      <aside className="palette">
        <h3>Add a question</h3>
        {ELEMENT_PALETTE.map((item) => (
          <button key={item.type} className="palette-item" onClick={() => addElement(item.type)}>
            <span>{item.icon}</span> {item.label}
          </button>
        ))}
      </aside>

      <section className="canvas">
        <h2>{localize(schema.title)}</h2>
        {schema.pages[0]?.elements.length ? (
          <ol>
            {schema.pages[0].elements.map((el) => (
              <li key={el.name}>
                <strong>{localize(el.label) || el.name}</strong> <em>({el.type})</em>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Pick a question type from the left to start building.</p>
        )}
      </section>

      <aside className="preview">
        <h3>Live preview</h3>
        <FormRenderer schema={schema} formId="preview" />
      </aside>
    </div>
  );
}

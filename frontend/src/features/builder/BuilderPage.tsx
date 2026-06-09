import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FormRenderer } from "../renderer/FormRenderer";
import { ElementCard } from "./ElementCard";
import { PropertiesPanel } from "./PropertiesPanel";
import { elementsOf } from "./model";
import { ELEMENT_PALETTE } from "./palette";

type Tab = "properties" | "preview";

/**
 * The form builder: palette (add), canvas (arrange/edit), inspector (properties) and a
 * live preview — the schema-driven, "easy as MS Forms" editing experience.
 */
export function BuilderPage() {
  const { formId = "new" } = useParams();
  const navigate = useNavigate();
  const store = useBuilderStore();
  const init = useBuilderStore((s) => s.init); // stable reference from zustand
  const { schema, selectedName, status, error, dirty } = store;
  const [tab, setTab] = useState<Tab>("properties");
  const dragName = useRef<string | null>(null);

  useEffect(() => {
    // Load (or reset) the draft whenever the route's form id changes.
    init(formId);
  }, [formId, init]);

  useEffect(() => {
    // Once a brand-new form is first saved it gets a real id — reflect that in the URL
    // so a reload reopens the saved draft instead of a blank "new" form.
    if (store.formId && store.formId !== formId) {
      navigate(`/builder/${store.formId}`, { replace: true });
    }
  }, [store.formId, formId, navigate]);

  const elements = elementsOf(schema);
  const selected = elements.find((e) => e.name === selectedName) ?? null;

  function handleDrop(targetName: string) {
    const source = dragName.current;
    if (!source || source === targetName) return;
    const targetIndex = elements.findIndex((e) => e.name === targetName);
    store.moveTo(source, targetIndex);
    dragName.current = null;
  }

  return (
    <div className="builder">
      {/* Toolbar */}
      <header className="builder-toolbar">
        <input
          className="title-input"
          value={localize(schema.title)}
          onChange={(e) => store.setTitle(e.target.value)}
          aria-label="Form title"
        />
        <div className="toolbar-actions">
          {error ? <span className="error">{error}</span> : null}
          <span className="muted">{dirty ? "Unsaved changes" : "Saved"}</span>
          <button type="button" onClick={() => store.save()} disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => store.publish()}
            disabled={status === "publishing"}
          >
            {status === "publishing" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </header>

      <div className="builder-body">
        {/* Palette */}
        <aside className="palette">
          <h3>Add a question</h3>
          {ELEMENT_PALETTE.map((item) => (
            <button
              key={item.type}
              type="button"
              className="palette-item"
              onClick={() => store.add(item.type)}
            >
              <span aria-hidden="true">{item.icon}</span> {item.label}
            </button>
          ))}
        </aside>

        {/* Canvas */}
        <section className="canvas">
          {elements.length === 0 ? (
            <p className="muted empty">Pick a question type on the left to start building.</p>
          ) : (
            <ol className="el-list">
              {elements.map((el, i) => (
                <ElementCard
                  key={el.name}
                  element={el}
                  index={i}
                  count={elements.length}
                  selected={el.name === selectedName}
                  onDragStart={() => {
                    dragName.current = el.name;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(el.name)}
                />
              ))}
            </ol>
          )}
        </section>

        {/* Inspector / preview */}
        <aside className="inspector">
          <div className="tabs">
            <button
              type="button"
              className={tab === "properties" ? "tab active" : "tab"}
              onClick={() => setTab("properties")}
            >
              Properties
            </button>
            <button
              type="button"
              className={tab === "preview" ? "tab active" : "tab"}
              onClick={() => setTab("preview")}
            >
              Preview
            </button>
          </div>

          {tab === "properties" ? (
            selected ? (
              <PropertiesPanel element={selected} />
            ) : (
              <p className="muted">Select a question to edit its settings.</p>
            )
          ) : (
            <div className="preview-pane">
              <FormRenderer schema={schema} formId="preview" />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

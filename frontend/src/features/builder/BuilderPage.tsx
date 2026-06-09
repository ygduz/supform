import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FormRenderer } from "../renderer/FormRenderer";
import { CanvasList } from "./CanvasList";
import { PropertiesPanel } from "./PropertiesPanel";
import { findElement, pageElements } from "./model";
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
  const { schema, selectedName, activePage, status, error, dirty } = store;
  const [tab, setTab] = useState<Tab>("properties");

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

  const elements = pageElements(schema, activePage);
  const selected = selectedName ? findElement(schema, selectedName) : null;

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
          {store.formId ? <Link to={`/forms/${store.formId}/responses`}>Responses</Link> : null}
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
          <div className="page-bar">
            {schema.pages.map((p, i) => (
              <button
                key={p.name}
                type="button"
                className={i === activePage ? "page-tab active" : "page-tab"}
                onClick={() => store.setActivePage(i)}
              >
                {localize(p.title) || `Page ${i + 1}`}
              </button>
            ))}
            <button type="button" className="page-add" onClick={() => store.addPage()}>
              + Page
            </button>
          </div>

          {schema.pages.length > 1 && (
            <div className="page-settings">
              <input
                type="text"
                aria-label="Page title"
                value={localize(schema.pages[activePage]?.title) || ""}
                placeholder={`Page ${activePage + 1}`}
                onChange={(e) => store.renamePage(activePage, e.target.value)}
              />
              <button type="button" onClick={() => store.removePage(activePage)}>
                Delete page
              </button>
            </div>
          )}

          {elements.length === 0 ? (
            <p className="muted empty">Pick a question type on the left to start building.</p>
          ) : (
            <CanvasList elements={elements} selectedName={selectedName} />
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

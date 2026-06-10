import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { FormSchema } from "@/types/form-schema";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FormRenderer } from "../renderer/FormRenderer";
import { saveMyTemplate } from "../templates/myTemplates";
import { CanvasList } from "./CanvasList";
import { PropertiesPanel } from "./PropertiesPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ShareDialog } from "./ShareDialog";
import { ShareLinkDialog } from "./ShareLinkDialog";
import { ThemePanel } from "./ThemePanel";
import { WebhooksDialog } from "./WebhooksDialog";
import { findElement, pageElements } from "./model";
import { ELEMENT_PALETTE } from "./palette";

type Tab = "properties" | "theme" | "settings" | "preview";

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
  const [sharing, setSharing] = useState(false);
  const [shareLink, setShareLink] = useState(false);
  const [integrations, setIntegrations] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  function exportJson() {
    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${schema.name || "form"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as FormSchema;
      if (!parsed || !Array.isArray(parsed.pages)) throw new Error("Not a Supform form schema.");
      store.loadTemplate(parsed); // seeds a fresh draft; user saves to persist
      navigate("/builder/new");
    } catch (err) {
      window.alert(`Could not import: ${(err as Error).message}`);
    }
  }

  function saveAsTemplate() {
    const name = window.prompt("Save this form as a template named:", localize(schema.title));
    if (name === null) return;
    saveMyTemplate(name, schema);
    window.alert("Saved to My templates.");
  }

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

  useEffect(() => {
    // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo — except inside text inputs, where the
    // browser's own text-editing undo must keep working.
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) useBuilderStore.getState().redo();
      else useBuilderStore.getState().undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
          <button
            type="button"
            title="Undo (Ctrl+Z)"
            onClick={() => store.undo()}
            disabled={store.past.length === 0}
          >
            ↶
          </button>
          <button
            type="button"
            title="Redo (Ctrl+Shift+Z)"
            onClick={() => store.redo()}
            disabled={store.future.length === 0}
          >
            ↷
          </button>
          {error ? <span className="error">{error}</span> : null}
          <span className="muted">
            {status === "saving" ? "Saving…" : dirty ? "Unsaved changes" : "Saved ✓"}
          </span>
          {store.formId ? (
            <button
              type="button"
              title="Public link, embed code, and QR"
              onClick={() => setShareLink(true)}
            >
              Share link
            </button>
          ) : null}
          {store.projectId ? (
            <button
              type="button"
              title="Manage who can collaborate on this project"
              onClick={() => setSharing(true)}
            >
              Share access
            </button>
          ) : null}
          {store.formId ? (
            <button
              type="button"
              title="Send submissions to external URLs"
              onClick={() => setIntegrations(true)}
            >
              Integrations
            </button>
          ) : null}
          {store.formId ? <Link to={`/forms/${store.formId}/responses`}>Responses</Link> : null}
          <button type="button" title="Save as a personal template" onClick={saveAsTemplate}>
            Save as template
          </button>
          <button type="button" title="Download this form's JSON schema" onClick={exportJson}>
            Export JSON
          </button>
          <button
            type="button"
            title="Load a form from a JSON file"
            onClick={() => importRef.current?.click()}
          >
            Import JSON
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importJson(file);
              e.target.value = "";
            }}
          />
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
              className={tab === "theme" ? "tab active" : "tab"}
              onClick={() => setTab("theme")}
            >
              Theme
            </button>
            <button
              type="button"
              className={tab === "settings" ? "tab active" : "tab"}
              onClick={() => setTab("settings")}
            >
              Settings
            </button>
            <button
              type="button"
              className={tab === "preview" ? "tab active" : "tab"}
              onClick={() => setTab("preview")}
            >
              Preview
            </button>
          </div>

          {tab === "properties" &&
            (selected ? (
              <PropertiesPanel element={selected} />
            ) : (
              <p className="muted">Select a question to edit its settings.</p>
            ))}
          {tab === "theme" && <ThemePanel />}
          {tab === "settings" && <SettingsPanel />}
          {tab === "preview" && (
            <div className="preview-pane">
              <FormRenderer schema={schema} formId="preview" />
            </div>
          )}
        </aside>
      </div>

      {sharing && store.projectId && (
        <ShareDialog projectId={store.projectId} onClose={() => setSharing(false)} />
      )}
      {integrations && store.formId && (
        <WebhooksDialog formId={store.formId} onClose={() => setIntegrations(false)} />
      )}
      {shareLink && store.formId && (
        <ShareLinkDialog formId={store.formId} onClose={() => setShareLink(false)} />
      )}
    </div>
  );
}

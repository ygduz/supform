import { Button } from "@/components";
import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { exportFormJson, exportFormText, importFormJson, saveFormAsTemplate } from "./exportImport";

interface Props {
  /** Open the share dialog on a given tab. */
  onShare: (tab: "link" | "people") => void;
  /** Open the integrations (webhooks) dialog. */
  onIntegrations: () => void;
  /** Open the full-screen preview modal. */
  onPreview: () => void;
  /** Show a transient toast (used to confirm publish). */
  showToast: (msg: string, tone?: "success" | "danger") => void;
}

/**
 * Top toolbar: form title, undo/redo, save status, Responses link, the "More" overflow
 * (share / integrations / export / import / save-as-template), and the primary
 * Preview / Save draft / Publish actions.
 */
export function BuilderToolbar({ onShare, onIntegrations, onPreview, showToast }: Props) {
  const store = useBuilderStore();
  const navigate = useNavigate();
  const { schema, status, error, dirty } = store;
  const importRef = useRef<HTMLInputElement>(null);

  return (
    <header className="builder-toolbar">
      <input
        className="title-input"
        value={localize(schema.title)}
        onChange={(e) => store.setTitle(e.target.value)}
        aria-label="Form title"
      />
      <div className="toolbar-actions">
        <Button
          variant="ghost"
          size="sm"
          title="Undo (Ctrl+Z)"
          onClick={() => store.undo()}
          disabled={store.past.length === 0}
        >
          ↶
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Redo (Ctrl+Shift+Z)"
          onClick={() => store.redo()}
          disabled={store.future.length === 0}
        >
          ↷
        </Button>
        {error ? <span className="error">{error}</span> : null}
        <span
          className="save-status"
          data-state={status === "saving" ? "saving" : dirty ? "dirty" : "saved"}
          aria-live="polite"
        >
          {status === "saving" ? "Saving…" : dirty ? "Unsaved changes" : "Saved ✓"}
        </span>
        {store.formId ? (
          <Link className="toolbar-link" to={`/forms/${store.formId}/responses`}>
            Responses
          </Link>
        ) : null}
        {/* Utility actions collapse into a disclosure so the primary actions
            (Save draft / Publish) are always visible, never scrolled off. */}
        <details className="toolbar-more">
          <summary aria-label="More actions">More ▾</summary>
          <div className="toolbar-more-menu">
            {store.formId ? (
              <button type="button" onClick={() => onShare("link")}>
                Share link
              </button>
            ) : null}
            {store.projectId ? (
              <button type="button" onClick={() => onShare("people")}>
                Share access
              </button>
            ) : null}
            {store.formId ? (
              <button type="button" onClick={onIntegrations}>
                Integrations
              </button>
            ) : null}
            <button type="button" onClick={() => saveFormAsTemplate(schema)}>
              Save as template
            </button>
            <button type="button" onClick={() => exportFormJson(schema)}>
              Export JSON
            </button>
            <button type="button" onClick={() => exportFormText(schema)}>
              Export text
            </button>
            <button type="button" onClick={() => importRef.current?.click()}>
              Import JSON
            </button>
          </div>
        </details>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFormJson(file, store.loadTemplate, navigate);
            e.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" onClick={onPreview}>
          Preview
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => store.save()}
          disabled={status === "saving"}
        >
          {status === "saving" ? "Saving…" : "Save draft"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={async () => {
            await store.publish();
            const s = useBuilderStore.getState();
            if (s.error) {
              showToast(s.error, "danger");
            } else {
              showToast("Form published! Share the link with respondents.");
              onShare("link");
            }
          }}
          disabled={status === "publishing"}
        >
          {status === "publishing" ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </header>
  );
}

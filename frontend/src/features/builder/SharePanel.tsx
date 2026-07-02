import { api } from "@/api/client";
import { useBuilderStore } from "@/stores/builderStore";
import { useEffect, useState } from "react";
import { LinkTab, PeopleTab } from "./ShareDialog";

/**
 * Share rail mode: public link/QR/embed (via ShareDialog's LinkTab, reused as-is), plus
 * "who can respond" and condensed People/Integrations sections. Integrations stays a launch
 * button into the existing WebhooksDialog rather than being fully inlined — its add/test/logs
 * UI is substantial enough that re-embedding it here would duplicate, not reuse, that logic.
 */
export function SharePanel({
  formId,
  onOpenIntegrations,
}: {
  formId: string | null;
  onOpenIntegrations: () => void;
}) {
  const { schema, setSettings, projectId } = useBuilderStore();
  const settings = schema.settings ?? {};
  const [hookCount, setHookCount] = useState<number | null>(null);

  useEffect(() => {
    if (!formId) return;
    let cancelled = false;
    api
      .listWebhooks(formId)
      .then((hooks) => {
        if (!cancelled) setHookCount(hooks.length);
      })
      .catch(() => {
        if (!cancelled) setHookCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  return (
    <div className="mode-panel share-mode">
      <div className="mode-main">
        <h3>Share</h3>
        {formId ? (
          <LinkTab formId={formId} />
        ) : (
          <p className="muted">
            Save the form to get a shareable link, QR code, and embed snippet.
          </p>
        )}
      </div>
      <div className="mode-sidebar">
        <div className="prop">
          <span>Who can respond</span>
          <label className="prop-check">
            <input
              type="checkbox"
              checked={Boolean(settings.requireLogin)}
              onChange={(e) => setSettings({ requireLogin: e.target.checked })}
            />
            <span>Require sign-in to respond</span>
          </label>
        </div>

        <div className="share-section">
          <h4>Integrations</h4>
          <p className="muted">
            {formId
              ? hookCount === null
                ? "Loading…"
                : `${hookCount} webhook${hookCount === 1 ? "" : "s"} configured`
              : "Save the form to add webhooks."}
          </p>
          <button
            type="button"
            className="link-button"
            onClick={onOpenIntegrations}
            disabled={!formId}
          >
            Manage integrations
          </button>
        </div>

        <div className="share-section">
          <h4>People</h4>
          {projectId ? (
            <PeopleTab projectId={projectId} />
          ) : (
            <p className="muted">Save the form to invite collaborators.</p>
          )}
        </div>
      </div>
    </div>
  );
}

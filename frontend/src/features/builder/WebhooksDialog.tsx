import { type Webhook, api } from "@/api/client";
import { useCallback, useEffect, useState } from "react";

/**
 * Manage a form's outbound webhooks. Each active hook receives a signed POST
 * (HMAC-SHA256 in the X-Supform-Signature header) whenever a response is submitted.
 * The signing secret is shown so the receiver can verify deliveries.
 */
export function WebhooksDialog({ formId, onClose }: { formId: string; onClose: () => void }) {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setHooks(await api.listWebhooks(formId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [formId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createWebhook(formId, url.trim());
      setUrl("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(hook: Webhook) {
    setError(null);
    try {
      await api.updateWebhook(formId, hook.id, { active: !hook.active });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onRemove(id: string) {
    setError(null);
    try {
      await api.deleteWebhook(formId, id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="modal-backdrop">
      <button
        type="button"
        className="modal-backdrop-close"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="modal webhooks-dialog">
        <header className="modal-head">
          <h2>Integrations</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="muted">
          Send each new submission to an external URL as a signed JSON POST. Verify the{" "}
          <code>X-Supform-Signature</code> header (HMAC-SHA256 of the body) using the secret.
        </p>

        <form className="share-add" onSubmit={onAdd}>
          <input
            type="url"
            placeholder="https://example.com/webhook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Webhook URL"
          />
          <button type="submit" className="button" disabled={busy || !url.trim()}>
            {busy ? "Adding…" : "Add"}
          </button>
        </form>

        {error && <p className="error">{error}</p>}

        <ul className="member-list">
          {hooks.length === 0 && <li className="muted">No webhooks yet.</li>}
          {hooks.map((h) => (
            <li key={h.id} className="webhook-row">
              <div className="webhook-main">
                <span className="webhook-url">{h.url}</span>
                <small className="muted">
                  secret: <code>{h.secret}</code>
                </small>
              </div>
              <label className="webhook-active">
                <input
                  type="checkbox"
                  checked={h.active}
                  onChange={() => onToggle(h)}
                  aria-label={`Active for ${h.url}`}
                />
                Active
              </label>
              <button type="button" className="link-button" onClick={() => onRemove(h.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

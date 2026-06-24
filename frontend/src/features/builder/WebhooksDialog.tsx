import { type Webhook, type WebhookDelivery, api } from "@/api/client";
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
            <WebhookRow
              key={h.id}
              hook={h}
              formId={formId}
              onToggle={() => onToggle(h)}
              onRemove={() => onRemove(h.id)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function WebhookRow({
  hook,
  formId,
  onToggle,
  onRemove,
}: {
  hook: Webhook;
  formId: string;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WebhookDelivery | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadDeliveries() {
    const data = await api.listWebhookDeliveries(formId, hook.id);
    setDeliveries(data);
  }

  async function toggleDeliveries() {
    if (!showDeliveries && deliveries === null) {
      await loadDeliveries();
    }
    setShowDeliveries((v) => !v);
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testWebhook(formId, hook.id);
      setTestResult(result);
      // Refresh delivery list if it's open
      if (showDeliveries) await loadDeliveries();
    } finally {
      setTesting(false);
    }
  }

  async function copySecret() {
    await navigator.clipboard.writeText(hook.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <li className="webhook-row">
      <div className="webhook-main">
        <span className="webhook-url">{hook.url}</span>
        <small className="muted webhook-secret">
          secret: <code>{hook.secret}</code>
          <button type="button" className="link-button" onClick={copySecret}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </small>
      </div>

      <div className="webhook-actions">
        <label className="webhook-active">
          <input
            type="checkbox"
            checked={hook.active}
            onChange={onToggle}
            aria-label={`Active for ${hook.url}`}
          />
          Active
        </label>
        <button
          type="button"
          className="link-button"
          onClick={onTest}
          disabled={testing}
          title="Send a test payload to this endpoint"
        >
          {testing ? "Sending…" : "Test"}
        </button>
        <button type="button" className="link-button" onClick={toggleDeliveries}>
          {showDeliveries ? "Hide logs" : "Logs"}
        </button>
        <button type="button" className="link-button" onClick={onRemove}>
          Remove
        </button>
      </div>

      {testResult && (
        <div
          className={`webhook-test-result ${testResult.error ? "webhook-test-fail" : "webhook-test-ok"}`}
        >
          {testResult.error
            ? `Test failed: ${testResult.error}`
            : `Test sent — ${testResult.status_code} in ${testResult.duration_ms}ms`}
        </div>
      )}

      {showDeliveries && (
        <div className="webhook-deliveries">
          {deliveries === null ? (
            <p className="muted">Loading…</p>
          ) : deliveries.length === 0 ? (
            <p className="muted">No delivery history yet.</p>
          ) : (
            <table className="delivery-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className={d.error ? "delivery-row-fail" : "delivery-row-ok"}>
                    <td>{new Date(d.created_at).toLocaleString()}</td>
                    <td>
                      {d.status_code ?? "—"}
                      {d.is_test && <em className="muted"> test</em>}
                    </td>
                    <td>{d.duration_ms != null ? `${d.duration_ms}ms` : "—"}</td>
                    <td className="delivery-error">{d.error ?? "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}

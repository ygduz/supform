import { type SubmissionRow, api } from "@/api/client";
import { Badge, Button, EmptyState, Spinner } from "@/components";
import { useCallback, useEffect, useState } from "react";

export function InboxPage() {
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<SubmissionRow | null>(null);

  const load = useCallback(async (uo = false) => {
    setLoading(true);
    try {
      const rows = await api.listInbox(uo);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(unreadOnly);
  }, [load, unreadOnly]);

  async function handleRead(item: SubmissionRow) {
    if (!item.read_at) {
      await api.markRead(item.id);
      setItems((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, read_at: new Date().toISOString() } : r)),
      );
    }
    setSelected(item);
  }

  async function handleMarkAllRead() {
    await api.markAllRead();
    setItems((prev) => prev.map((r) => ({ ...r, read_at: r.read_at ?? new Date().toISOString() })));
  }

  const unreadCount = items.filter((r) => !r.read_at).length;

  return (
    <div className="inbox-layout">
      <div className="inbox-sidebar">
        <div className="inbox-toolbar">
          <h2 className="inbox-title">
            Inbox {unreadCount > 0 && <Badge tone="primary">{unreadCount}</Badge>}
          </h2>
          <div className="inbox-actions">
            <label className="inbox-toggle">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              Unread only
            </label>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {loading && (
          <div
            className="inbox-msg"
            style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
          >
            <Spinner size="sm" />
            <span>Loading…</span>
          </div>
        )}
        {!loading && items.length === 0 && (
          <EmptyState
            icon="📬"
            title={unreadOnly ? "No unread submissions" : "No submissions yet"}
            description={unreadOnly ? "All caught up!" : "Submissions will appear here."}
            className="inbox-msg inbox-empty"
          />
        )}

        <ul className="inbox-list">
          {items.map((item) => (
            <li
              key={item.id}
              className={`inbox-item${!item.read_at ? " inbox-item--unread" : ""}${selected?.id === item.id ? " inbox-item--active" : ""}`}
              onClick={() => handleRead(item)}
              onKeyDown={(e) => e.key === "Enter" && handleRead(item)}
            >
              <div className="inbox-item-meta">
                <span className="inbox-item-form">{item.form_title ?? item.form_id}</span>
                <span className="inbox-item-time">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>
              {!item.read_at && <span className="inbox-unread-dot" />}
            </li>
          ))}
        </ul>
      </div>

      <div className="inbox-detail">
        {selected ? (
          <>
            <h3 className="inbox-detail-title">
              {selected.form_title ?? "Submission detail"}
            </h3>
            <p className="inbox-detail-time">
              Received {new Date(selected.created_at).toLocaleString()}
            </p>
            <dl className="inbox-answers">
              {Object.entries(selected.answers).map(([k, v]) => (
                <div key={k} className="inbox-answer-row">
                  <dt>{k}</dt>
                  <dd>{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <EmptyState
            icon="👆"
            title="Select a submission"
            description="Click a submission on the left to view its details."
            className="inbox-detail-empty"
          />
        )}
      </div>
    </div>
  );
}

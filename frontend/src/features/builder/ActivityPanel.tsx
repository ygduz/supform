import { api } from "@/api/client";
import { useEffect, useState } from "react";

interface AuditEntry {
  id: string;
  action: string;
  summary: string | null;
  created_at: string;
}

const ACTION_ICON: Record<string, string> = {
  created: "✦",
  draft_saved: "✎",
  published: "▲",
  deleted: "✕",
  restored: "↺",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  formId: string;
}

export function ActivityPanel({ formId }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getFormAudit(formId)
      .then(setEntries)
      .catch((e: Error) => setError(e.message ?? "Failed to load activity"))
      .finally(() => setLoading(false));
  }, [formId]);

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="muted">{error}</p>;
  if (entries.length === 0) return <p className="muted">No activity yet.</p>;

  return (
    <div className="activity-list">
      {entries.map((entry) => (
        <div key={entry.id} className="activity-entry">
          <span className="activity-icon">{ACTION_ICON[entry.action] ?? "•"}</span>
          <div className="activity-body">
            <span className="activity-action">{entry.action.replace("_", " ")}</span>
            {entry.summary && <span className="activity-summary">{entry.summary}</span>}
            <span className="activity-time">{relativeTime(entry.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

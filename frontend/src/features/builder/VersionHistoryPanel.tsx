import { type FormVersionOut, api } from "@/api/client";
import { Button } from "@/components";
import { useEffect, useState } from "react";

interface Props {
  formId: string;
  onRestoreVersion: (version: number) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function VersionHistoryPanel({ formId, onRestoreVersion }: Props) {
  const [versions, setVersions] = useState<FormVersionOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .listVersions(formId)
      .then(setVersions)
      .catch((e) => setError(e.message ?? "Failed to load versions"))
      .finally(() => setLoading(false));
  }, [formId]);

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="muted">{error}</p>;
  if (versions.length === 0) return <p className="muted">No published versions yet.</p>;

  return (
    <div className="version-list">
      {versions.map((v) => (
        <div key={v.version} className="version-card">
          <div className="version-meta">
            <span className="version-number">v{v.version}</span>
            <span className="version-time">{relativeTime(v.created_at)}</span>
          </div>
          {v.title && <span className="version-title">{v.title}</span>}
          <Button
            variant="ghost"
            size="sm"
            disabled={restoring !== null}
            onClick={async () => {
              setRestoring(v.version);
              try {
                onRestoreVersion(v.version);
              } finally {
                setRestoring(null);
              }
            }}
          >
            {restoring === v.version ? "Restoring…" : "Restore as draft"}
          </Button>
        </div>
      ))}
    </div>
  );
}

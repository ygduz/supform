import { type FormVersionOut, api } from "@/api/client";
import { Button } from "@/components";
import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element, FormSchema } from "@/types/form-schema";
import { useEffect, useState } from "react";

/** Total number of elements (including nested group/repeat children) in a snapshot. */
function countFields(schema: FormSchema): number {
  let n = 0;
  const walk = (els: Element[]) => {
    for (const el of els) {
      n++;
      if (el.elements) walk(el.elements);
    }
  };
  for (const p of schema.pages) walk(p.elements);
  return n;
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

/** In-session edit timeline, backed by the builder store's undo/redo snapshot stack. */
function SessionTimeline() {
  const past = useBuilderStore((s) => s.past);
  const future = useBuilderStore((s) => s.future);
  const schema = useBuilderStore((s) => s.schema);
  const jumpTo = useBuilderStore((s) => s.jumpTo);

  const timeline = [...past, schema, ...future];
  const currentIndex = past.length;

  if (timeline.length <= 1) {
    return <p className="muted">No edits yet this session.</p>;
  }

  // Newest at the top.
  const rows = timeline.map((snap, i) => ({ snap, i })).reverse();

  return (
    <ol className="edit-history-list">
      {rows.map(({ snap, i }) => {
        const isCurrent = i === currentIndex;
        const isFuture = i > currentIndex;
        const fields = countFields(snap);
        const title = localize(snap.title) || "Untitled form";
        const label = isCurrent ? "Current" : i === timeline.length - 1 ? "Latest" : `Step ${i}`;
        return (
          <li
            key={i}
            className={`eh-row${isCurrent ? " current" : ""}${isFuture ? " future" : ""}`}
          >
            <span className="eh-dot" aria-hidden="true" />
            <button
              type="button"
              className="eh-entry"
              disabled={isCurrent}
              onClick={() => jumpTo(i)}
              title={isCurrent ? "This is the current state" : "Revert to this point"}
            >
              <span className="eh-label">{label}</span>
              <span className="eh-meta">
                {title} · {fields} {fields === 1 ? "field" : "fields"}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Published, server-side versions for an existing form. */
function PublishedVersions({
  formId,
  onRestoreVersion,
}: {
  formId: string;
  onRestoreVersion: (version: number) => void;
}) {
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

interface Props {
  /** The form id, or "new" for an unsaved form (hides the published-versions section). */
  formId: string;
  onRestoreVersion: (version: number) => void;
}

/**
 * Unified history view. Two timelines, clearly separated:
 *   • This session — every in-canvas edit, revertable instantly (local undo stack).
 *   • Published versions — server-side snapshots from each publish, restorable as a draft.
 */
export function HistoryPanel({ formId, onRestoreVersion }: Props) {
  const isSaved = formId !== "new";
  return (
    <div className="history-panel">
      <section className="history-section">
        <h4 className="history-section-title">This session</h4>
        <p className="edit-history-intro">
          Click any point to revert the canvas to exactly how it looked then. Nothing is lost — you
          can jump forward again.
        </p>
        <SessionTimeline />
      </section>
      {isSaved && (
        <section className="history-section">
          <h4 className="history-section-title">Published versions</h4>
          <PublishedVersions formId={formId} onRestoreVersion={onRestoreVersion} />
        </section>
      )}
    </div>
  );
}

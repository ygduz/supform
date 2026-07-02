import { type SubmissionRow, api } from "@/api/client";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDuration } from "../responses/AnalyticsPanel";
import { completionTimeStats, responsesByDay, summaryStats } from "../responses/analytics";

/**
 * Results rail mode: a glanceable stats grid + response timeline, sourced from the same
 * `listSubmissions` API and `analytics.ts` helpers the full Responses page uses — not
 * placeholder data. "View full analytics" deep-links to that page for the complete
 * Analytics/Table/Map/Workflow/Report suite, which stays fully reachable, unchanged.
 *
 * The handoff sketch's "Completion" stat has no equivalent in this schema — Supform only
 * ever stores a submission once it's actually completed, so there's no partial/abandoned
 * state to compute a completion rate from. Swapped for "Last 7 days" (real, already computed
 * by summaryStats) instead of fabricating a number.
 */
export function ResultsPanel({ formId }: { formId: string }) {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listSubmissions(formId)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  return (
    <div className="mode-panel results-mode">
      <div className="results-header">
        <h3>Results</h3>
        <Link to={`/forms/${formId}/responses?view=analytics`} className="link-button">
          View full analytics →
        </Link>
      </div>

      {error && <p className="error">{error}</p>}
      {!error && !rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="muted">No responses yet.</p>}
      {rows && rows.length > 0 && <ResultsStats rows={rows} />}
    </div>
  );
}

function ResultsStats({ rows }: { rows: SubmissionRow[] }) {
  const summary = summaryStats(rows);
  const completion = completionTimeStats(rows);
  const onHold = rows.filter((r) => r.validation_status === "on_hold").length;
  const byDay = responsesByDay(rows);
  const peak = byDay.reduce((m, d) => Math.max(m, d.count), 0);

  return (
    <>
      <div className="analytics-summary">
        <div className="analytics-stat">
          <span className="analytics-stat-value">{summary.total}</span>
          <span className="analytics-stat-label">Responses</span>
        </div>
        <div className="analytics-stat">
          <span className="analytics-stat-value">{summary.last7Days}</span>
          <span className="analytics-stat-label">Last 7 days</span>
        </div>
        <div className="analytics-stat">
          <span className="analytics-stat-value">
            {completion ? formatDuration(completion.mean) : "—"}
          </span>
          <span className="analytics-stat-label">Avg time</span>
        </div>
        <div className="analytics-stat">
          <span className="analytics-stat-value">{onHold}</span>
          <span className="analytics-stat-label">On hold</span>
        </div>
      </div>

      {byDay.length > 1 && (
        <div className="analytics-card">
          <h4>Responses over time</h4>
          <div className="timeline" role="img" aria-label="Responses per day">
            {byDay.map((d) => (
              <div className="timeline-col" key={d.date} title={`${d.date}: ${d.count}`}>
                <div
                  className="timeline-bar"
                  style={{ height: `${peak > 0 ? (d.count / peak) * 100 : 0}%` }}
                />
              </div>
            ))}
          </div>
          <div className="timeline-axis">
            <span>{byDay[0].date}</span>
            <span>{byDay[byDay.length - 1].date}</span>
          </div>
        </div>
      )}
    </>
  );
}

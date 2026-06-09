import type { SubmissionRow } from "@/api/client";
import type { FormSchema } from "@/types/form-schema";
import { useMemo } from "react";
import { numericStats, responsesByDay } from "./analytics";
import { buildSummaries } from "./columns";

/** Visual analytics for a form's responses: timeline, choice breakdowns, numeric stats. */
export function AnalyticsPanel({
  schema,
  rows,
}: {
  schema: FormSchema;
  rows: SubmissionRow[];
}) {
  const summaries = useMemo(() => buildSummaries(schema, rows), [schema, rows]);
  const numeric = useMemo(() => numericStats(schema, rows), [schema, rows]);
  const byDay = useMemo(() => responsesByDay(rows), [rows]);

  const peak = byDay.reduce((m, d) => Math.max(m, d.count), 0);

  return (
    <div className="analytics">
      {byDay.length > 1 && (
        <div className="analytics-card">
          <h3>Responses over time</h3>
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

      {numeric.length > 0 && (
        <div className="analytics-card">
          <h3>Numeric fields</h3>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Responses</th>
                <th>Average</th>
                <th>Median</th>
                <th>Min</th>
                <th>Max</th>
              </tr>
            </thead>
            <tbody>
              {numeric.map((s) => (
                <tr key={s.name}>
                  <td>{s.label}</td>
                  <td>{s.count}</td>
                  <td>{round(s.mean)}</td>
                  <td>{round(s.median)}</td>
                  <td>{round(s.min)}</td>
                  <td>{round(s.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summaries.length > 0 && (
        <div className="chart-grid">
          {summaries.map((summary) => {
            const total = summary.counts.reduce((acc, c) => acc + c.count, 0);
            return (
              <div className="analytics-card" key={summary.name}>
                <h3>{summary.label}</h3>
                <ul className="bar-list">
                  {summary.counts.map((entry) => {
                    const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
                    return (
                      <li key={entry.label}>
                        <div className="bar-head">
                          <span>{entry.label}</span>
                          <span className="muted">
                            {entry.count} · {pct}%
                          </span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {summaries.length === 0 && numeric.length === 0 && (
        <p className="muted">No chartable fields — this form has only free-text questions.</p>
      )}
    </div>
  );
}

/** Trim to two decimals without trailing zeros (e.g. 4.00 -> 4, 4.5 -> 4.5). */
function round(n: number): string {
  return Number(n.toFixed(2)).toString();
}

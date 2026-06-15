import type { SubmissionRow } from "@/api/client";
import type { FormSchema } from "@/types/form-schema";
import { useMemo } from "react";
import {
  completionTimeStats,
  numericStats,
  responsesByDay,
  summaryStats,
  textResponses,
} from "./analytics";
import { buildSummaries } from "./columns";

const FLAG_LABELS: Record<string, string> = {
  too_fast: "Too fast",
  straight_lining: "Straight-lining",
  geo_outlier: "Geo outlier",
};

/** Visual analytics for a form's responses: summary, timeline, choice breakdowns, numeric stats. */
export function AnalyticsPanel({
  schema,
  rows,
}: {
  schema: FormSchema;
  rows: SubmissionRow[];
}) {
  const summary = useMemo(() => summaryStats(rows), [rows]);
  const completion = useMemo(() => completionTimeStats(rows), [rows]);
  const summaries = useMemo(() => buildSummaries(schema, rows), [schema, rows]);
  const numeric = useMemo(() => numericStats(schema, rows), [schema, rows]);
  const texts = useMemo(() => textResponses(schema, rows), [schema, rows]);
  const byDay = useMemo(() => responsesByDay(rows), [rows]);

  const peak = byDay.reduce((m, d) => Math.max(m, d.count), 0);

  if (rows.length === 0) {
    return <p className="muted">No responses to chart yet.</p>;
  }

  return (
    <div className="analytics">
      {/* ── Summary strip ─────────────────────────────────────────────── */}
      <div className="analytics-summary">
        <div className="analytics-stat">
          <span className="analytics-stat-value">{summary.total}</span>
          <span className="analytics-stat-label">Total responses</span>
        </div>
        <div className="analytics-stat">
          <span className="analytics-stat-value">{summary.last7Days}</span>
          <span className="analytics-stat-label">Last 7 days</span>
        </div>
        {completion && (
          <div className="analytics-stat">
            <span className="analytics-stat-value">{formatDuration(completion.mean)}</span>
            <span className="analytics-stat-label">Avg completion time</span>
          </div>
        )}
        <div className="analytics-stat">
          <span
            className="analytics-stat-value"
            style={{ color: summary.flagRate > 20 ? "var(--color-danger, #c0392b)" : undefined }}
          >
            {summary.flagRate}%
          </span>
          <span className="analytics-stat-label">Flag rate</span>
        </div>
      </div>

      {/* ── Timeline ──────────────────────────────────────────────────── */}
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

      {/* ── Quality flags breakdown ───────────────────────────────────── */}
      {summary.flagBreakdown.length > 0 && (
        <div className="analytics-card">
          <h3>Data quality flags</h3>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            {summary.flaggedCount} of {summary.total} submission
            {summary.total !== 1 ? "s" : ""} ({summary.flagRate}%) have at least one flag.
          </p>
          <ul className="bar-list">
            {summary.flagBreakdown.map((f) => (
              <li key={f.flag}>
                <div className="bar-head">
                  <span className={`quality-flag quality-flag--${f.flag}`}>
                    {FLAG_LABELS[f.flag] ?? f.flag}
                  </span>
                  <span className="muted">
                    {f.count} · {f.pct}%
                  </span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill bar-fill--flag" style={{ width: `${f.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Completion time detail ────────────────────────────────────── */}
      {completion && (
        <div className="analytics-card">
          <h3>Completion time</h3>
          <p className="muted" style={{ marginBottom: "0.5rem" }}>
            Based on {completion.count} timed submission{completion.count !== 1 ? "s" : ""}.
          </p>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Average</th>
                <th>Median</th>
                <th>Fastest</th>
                <th>Slowest</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{formatDuration(completion.mean)}</td>
                <td>{formatDuration(completion.median)}</td>
                <td>{formatDuration(completion.min)}</td>
                <td>{formatDuration(completion.max)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Numeric field stats ───────────────────────────────────────── */}
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

      {/* ── Choice field charts ───────────────────────────────────────── */}
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

      {/* ── Text field clouds ─────────────────────────────────────────── */}
      {texts.length > 0 && (
        <div className="text-analytics">
          {texts.map((field) => (
            <div className="analytics-card" key={field.name}>
              <h3>{field.label}</h3>
              <p className="muted text-analytics-count">
                {field.count} {field.count === 1 ? "answer" : "answers"}
              </p>
              {field.topWords.length > 0 && (
                <div className="word-cloud">
                  {field.topWords.map((w) => (
                    <span
                      className="word-chip"
                      key={w.word}
                      style={{ fontSize: `${wordSize(w.count, field.topWords[0].count)}rem` }}
                      title={`${w.count}×`}
                    >
                      {w.word}
                    </span>
                  ))}
                </div>
              )}
              <ul className="text-answer-list">
                {field.answers.slice(0, MAX_TEXT_ANSWERS).map((answer, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: answers have no stable id
                  <li key={i}>{answer}</li>
                ))}
              </ul>
              {field.count > MAX_TEXT_ANSWERS && (
                <p className="muted">
                  + {field.count - MAX_TEXT_ANSWERS} more — see the Table view or export.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const MAX_TEXT_ANSWERS = 20;

function wordSize(count: number, max: number): number {
  if (max <= 1) return 1;
  return Number((0.85 + (count / max) * 0.75).toFixed(2));
}

function round(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

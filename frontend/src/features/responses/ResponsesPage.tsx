import { type SubmissionRow, api, isAuthenticated } from "@/api/client";
import type { FormSchema } from "@/types/form-schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { buildColumns } from "./columns";

type Status = "loading" | "ready" | "unauth" | "error";
type Format = "csv" | "xlsx" | "json";
type View = "analytics" | "table";

/** Responses dashboard: analytics charts, a submissions table, and export downloads. */
export function ResponsesPage() {
  const { formId } = useParams();
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("analytics");

  useEffect(() => {
    if (!formId) return;
    if (!isAuthenticated()) {
      setStatus("unauth");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [loadedSchema, submissions] = await Promise.all([
          api.getPublishedSchema(formId),
          api.listSubmissions(formId),
        ]);
        if (cancelled) return;
        setSchema(loadedSchema);
        setRows(submissions);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formId]);

  const columns = useMemo(() => (schema ? buildColumns(schema) : []), [schema]);

  const download = useCallback(
    async (format: Format) => {
      if (!formId) return;
      try {
        const { blob, filename } = await api.exportSubmissions(formId, format);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [formId],
  );

  if (status === "loading") return <p className="muted">Loading responses…</p>;

  if (status === "unauth") {
    return (
      <section>
        <h1>Responses</h1>
        <p className="muted">
          Please <Link to="/login">sign in</Link> to view this form's responses.
        </p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section>
        <h1>Responses</h1>
        <p className="error">{error}</p>
        <p className="muted">A form must be published before its responses can be viewed.</p>
      </section>
    );
  }

  return (
    <section className="responses">
      <header className="responses-header">
        <div>
          <h1>Responses</h1>
          <p className="muted">
            {rows.length} {rows.length === 1 ? "response" : "responses"}
          </p>
        </div>
        <div className="export-actions">
          <span className="muted">Export:</span>
          <button type="button" onClick={() => download("csv")} disabled={rows.length === 0}>
            CSV
          </button>
          <button type="button" onClick={() => download("xlsx")} disabled={rows.length === 0}>
            XLSX
          </button>
          <button type="button" onClick={() => download("json")} disabled={rows.length === 0}>
            JSON
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {rows.length === 0 ? (
        <p className="muted empty">No responses yet. Share the form to start collecting.</p>
      ) : (
        <>
          <div className="view-tabs">
            <button
              type="button"
              className={view === "analytics" ? "tab active" : "tab"}
              onClick={() => setView("analytics")}
            >
              Analytics
            </button>
            <button
              type="button"
              className={view === "table" ? "tab active" : "tab"}
              onClick={() => setView("table")}
            >
              Table
            </button>
          </div>

          {view === "analytics" && schema && <AnalyticsPanel schema={schema} rows={rows} />}

          {view === "table" && (
            <div className="table-scroll">
              <table className="responses-table">
                <thead>
                  <tr>
                    <th>Submitted</th>
                    {columns.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="muted">{new Date(row.created_at).toLocaleString()}</td>
                      {columns.map((col) => (
                        <td key={col.key}>{col.value(row.answers)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

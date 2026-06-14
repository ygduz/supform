import { type SubmissionRow, type ValidationStatus, api, isAuthenticated } from "@/api/client";
import type { FormSchema } from "@/types/form-schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { MapPanel } from "./MapPanel";
import { buildColumns } from "./columns";

type Status = "loading" | "ready" | "unauth" | "error";
type Format = "csv" | "xlsx" | "json" | "geojson" | "spss";
type View = "analytics" | "table" | "map";
type StatusFilter = "all" | ValidationStatus;

interface EditState {
  row: SubmissionRow;
  draft: string; // JSON text edited in the textarea
  saving: boolean;
  error: string | null;
}

const STATUS_LABELS: Record<ValidationStatus, string> = {
  approved: "Approved",
  on_hold: "On hold",
  not_approved: "Not approved",
};
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "approved", label: "Approved" },
  { id: "on_hold", label: "On hold" },
  { id: "not_approved", label: "Not approved" },
];

/** Responses dashboard: analytics charts, a submissions table, and export downloads. */
export function ResponsesPage() {
  const { formId } = useParams();
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("analytics");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editState, setEditState] = useState<EditState | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  async function onSetStatus(row: SubmissionRow, next: ValidationStatus | null) {
    if (!formId) return;
    setError(null);
    try {
      await api.setValidationStatus(formId, row.id, next);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, validation_status: next } : r)));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function openEdit(row: SubmissionRow) {
    setEditState({
      row,
      draft: JSON.stringify(row.answers, null, 2),
      saving: false,
      error: null,
    });
  }

  async function saveEdit() {
    if (!formId || !editState) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editState.draft);
    } catch {
      setEditState((s) => s && { ...s, error: "Invalid JSON — please fix before saving." });
      return;
    }
    setEditState((s) => s && { ...s, saving: true, error: null });
    try {
      const updated = await api.editSubmission(formId, editState.row.id, parsed);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditState(null);
    } catch (err) {
      setEditState((s) => s && { ...s, saving: false, error: (err as Error).message });
    }
  }

  async function onDeleteRow(row: SubmissionRow) {
    if (!formId || !window.confirm("Delete this response? This cannot be undone.")) return;
    setError(null);
    try {
      await api.deleteSubmission(formId, row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

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
  const hasMedia = useMemo(
    () =>
      !!schema &&
      schema.pages.some((p) => {
        const walk = (els: typeof p.elements): boolean =>
          els.some(
            (el) =>
              el.type === "file" ||
              el.type === "image" ||
              el.type === "signature" ||
              (el.elements ? walk(el.elements) : false),
          );
        return walk(p.elements);
      }),
    [schema],
  );
  const hasGeo = useMemo(
    () =>
      !!schema &&
      schema.pages.some(function check(p): boolean {
        const walk = (els: typeof p.elements): boolean =>
          els.some(
            (el) =>
              el.type === "geopoint" ||
              el.type === "geotrace" ||
              el.type === "geoshape" ||
              (el.elements ? walk(el.elements) : false),
          );
        return walk(p.elements);
      }),
    [schema],
  );
  const tableRows = useMemo(
    () =>
      statusFilter === "all" ? rows : rows.filter((r) => r.validation_status === statusFilter),
    [rows, statusFilter],
  );

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
          {hasGeo && (
            <button type="button" onClick={() => download("geojson")} disabled={rows.length === 0}>
              GeoJSON
            </button>
          )}
          <button type="button" onClick={() => download("spss")} disabled={rows.length === 0}>
            SPSS
          </button>
          {hasMedia && (
            <button
              type="button"
              onClick={async () => {
                if (!formId) return;
                try {
                  const { blob, filename } = await api.exportMediaZip(formId);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
              disabled={rows.length === 0}
            >
              Media ZIP
            </button>
          )}
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
            {hasGeo && (
              <button
                type="button"
                className={view === "map" ? "tab active" : "tab"}
                onClick={() => setView("map")}
              >
                Map
              </button>
            )}
          </div>

          {view === "analytics" && schema && <AnalyticsPanel schema={schema} rows={rows} />}
          {view === "map" && schema && <MapPanel schema={schema} rows={rows} />}

          {view === "table" && (
            <>
              <div className="filter-chips">
                {STATUS_FILTERS.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    className={statusFilter === f.id ? "chip active" : "chip"}
                    onClick={() => setStatusFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="table-scroll">
                <table className="responses-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Submitted</th>
                      {columns.map((col) => (
                        <th key={col.key}>{col.label}</th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <select
                            className={`status-select ${row.validation_status ?? "none"}`}
                            value={row.validation_status ?? ""}
                            onChange={(e) =>
                              onSetStatus(row, (e.target.value || null) as ValidationStatus | null)
                            }
                            aria-label="Validation status"
                          >
                            <option value="">Unreviewed</option>
                            {(Object.keys(STATUS_LABELS) as ValidationStatus[]).map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="muted">{new Date(row.created_at).toLocaleString()}</td>
                        {columns.map((col) => (
                          <td key={col.key}>{col.value(row.answers)}</td>
                        ))}
                        <td className="row-actions">
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => openEdit(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="link-button danger"
                            onClick={() => onDeleteRow(row)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      {editState && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: overlay backdrop dismiss
        <div className="edit-overlay" onClick={() => !editState.saving && setEditState(null)}>
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only */}
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit response</h2>
            <p className="muted">Submitted {new Date(editState.row.created_at).toLocaleString()}</p>
            <textarea
              ref={editRef}
              className="edit-json"
              value={editState.draft}
              onChange={(e) =>
                setEditState((s) => s && { ...s, draft: e.target.value, error: null })
              }
              rows={20}
              spellCheck={false}
            />
            {editState.error && <p className="error">{editState.error}</p>}
            <div className="edit-footer">
              <button
                type="button"
                className="button"
                onClick={saveEdit}
                disabled={editState.saving}
              >
                {editState.saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => setEditState(null)}
                disabled={editState.saving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

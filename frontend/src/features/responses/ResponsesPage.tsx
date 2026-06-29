import { type SubmissionRow, type ValidationStatus, api, isAuthenticated } from "@/api/client";
import { Alert, Button, EmptyState, Modal, Spinner, Tabs } from "@/components";
import { localize } from "@/lib/i18n";
import type { FormSchema } from "@/types/form-schema";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { FormContextNav } from "../form/FormContextNav";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { MapPanel } from "./MapPanel";
import { WorkflowBoard } from "./WorkflowBoard";
import { buildColumns } from "./columns";

// The report dashboard is its own code-split chunk — only downloaded when the Report tab
// is opened, preserving the bundle savings the standalone /report route used to give.
const ReportPanel = lazy(() =>
  import("../reports/ReportPanel").then((m) => ({ default: m.ReportPanel })),
);

type Status = "loading" | "ready" | "unauth" | "error";
type Format = "csv" | "xlsx" | "json" | "geojson" | "kml" | "spss" | "xlsform";
type View = "analytics" | "table" | "map" | "workflow" | "report";
const VIEWS: readonly View[] = ["analytics", "table", "map", "workflow", "report"];
type StatusFilter = "all" | ValidationStatus;

interface EditState {
  row: SubmissionRow;
  draft: string; // JSON text edited in the textarea
  saving: boolean;
  error: string | null;
}

const FLAG_LABELS: Record<string, string> = {
  too_fast: "⚡ Too fast",
  straight_lining: "↔ Straight-line",
  geo_outlier: "📍 Geo outlier",
};
const FLAG_TITLES: Record<string, string> = {
  too_fast: "Submitted unusually quickly — may indicate a bot or inattentive respondent",
  straight_lining: "Same answer selected for all scale/matrix questions",
  geo_outlier: "GPS location is outside the expected geographic area",
};

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
  // The active view lives in the URL (`?view=`) so each tab — Analytics, Table, Map,
  // Workflow, Report — is bookmarkable/deep-linkable, and the old /report route can
  // redirect straight to ?view=report.
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view") as View | null;
  const view: View = viewParam && VIEWS.includes(viewParam) ? viewParam : "analytics";
  const setView = (v: View) =>
    setSearchParams(
      (prev) => {
        prev.set("view", v);
        return prev;
      },
      { replace: true },
    );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editHistory, setEditHistory] = useState<
    Array<{ id: string; changed_fields: string[]; created_at: string }>
  >([]);
  const [search, setSearch] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === tableRows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tableRows.map((r) => r.id)));
    }
  }

  async function bulkSetStatus(status: ValidationStatus | null) {
    if (!formId || selected.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      await Promise.all([...selected].map((id) => api.setValidationStatus(formId, id, status)));
      setRows((prev) =>
        prev.map((r) => (selected.has(r.id) ? { ...r, validation_status: status } : r)),
      );
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (!formId || selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} response(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    setError(null);
    try {
      await Promise.all([...selected].map((id) => api.deleteSubmission(formId, id)));
      setRows((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

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
    setEditHistory([]);
    if (formId) {
      api
        .getSubmissionEdits(formId, row.id)
        .then(setEditHistory)
        .catch(() => {});
    }
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
  const quizMode = Boolean(schema?.settings?.quizMode);
  /** Display a submission's quiz score as "earned/max" (graded) or the additive score. */
  const scoreText = (row: SubmissionRow): string => {
    const g = row.grading;
    if (g && g.gradedCount > 0) return `${g.earnedPoints}/${g.maxPoints}`;
    if (typeof row.score === "number") return String(row.score);
    return "—";
  };
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
  const tableRows = useMemo(() => {
    let filtered =
      statusFilter === "all" ? rows : rows.filter((r) => r.validation_status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((r) =>
        Object.values(r.answers).some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }
    return filtered;
  }, [rows, statusFilter, search]);

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

  if (status === "loading")
    return (
      <div className="responses-loading">
        <Spinner size="lg" />
      </div>
    );

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
        <Alert tone="danger">{error}</Alert>
        <p className="muted">A form must be published before its responses can be viewed.</p>
      </section>
    );
  }

  const viewTabs = [
    { key: "analytics", label: "Analytics" },
    { key: "table", label: "Table", count: rows.length },
    ...(hasGeo ? [{ key: "map", label: "Map" }] : []),
    { key: "workflow", label: "Workflow" },
    { key: "report", label: "Report" },
  ];

  return (
    <section className="responses">
      <FormContextNav
        formId={formId ?? ""}
        title={schema ? localize(schema.title) : undefined}
        active="responses"
      />
      <header className="responses-header">
        <div>
          <h1>Responses</h1>
          <p className="muted">
            {rows.length} {rows.length === 1 ? "response" : "responses"}
          </p>
        </div>
        <div className="export-actions">
          <details className="export-dropdown">
            <summary className="button outline">Export ▾</summary>
            <div className="export-menu">
              <button type="button" onClick={() => download("csv")} disabled={rows.length === 0}>
                CSV
              </button>
              <button type="button" onClick={() => download("xlsx")} disabled={rows.length === 0}>
                XLSX
              </button>
              <button type="button" onClick={() => download("json")} disabled={rows.length === 0}>
                JSON
              </button>
              <button type="button" onClick={() => download("spss")} disabled={rows.length === 0}>
                SPSS
              </button>
              <button type="button" onClick={() => download("xlsform")}>
                XLSForm
              </button>
              {hasGeo && (
                <button
                  type="button"
                  onClick={() => download("geojson")}
                  disabled={rows.length === 0}
                >
                  GeoJSON
                </button>
              )}
              {hasGeo && (
                <button type="button" onClick={() => download("kml")} disabled={rows.length === 0}>
                  KML
                </button>
              )}
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
          </details>
        </div>
      </header>

      {error && (
        <Alert tone="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon="📬"
          title="No responses yet"
          description="Share the form link to start collecting responses."
          action={
            formId ? (
              <Button
                variant="primary"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/f/${formId}`);
                }}
              >
                Copy share link
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Tabs tabs={viewTabs} active={view} onChange={(key) => setView(key as View)} />

          {view === "analytics" && schema && <AnalyticsPanel schema={schema} rows={rows} />}
          {view === "report" && (
            <Suspense fallback={<Spinner size="sm" />}>
              <ReportPanel rows={rows} />
            </Suspense>
          )}
          {view === "map" && schema && <MapPanel schema={schema} rows={rows} />}
          {view === "workflow" && schema && (
            <WorkflowBoard
              schema={schema}
              submissions={rows}
              onUpdate={(updated) =>
                setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
              }
            />
          )}

          {view === "table" && (
            <>
              <div className="responses-search">
                <input
                  type="search"
                  placeholder="Search responses…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="responses-search-input"
                />
              </div>
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
              {selected.size > 0 && (
                <div className="bulk-bar">
                  <span className="bulk-count">{selected.size} selected</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => bulkSetStatus("approved")}
                    disabled={bulkBusy}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => bulkSetStatus("on_hold")}
                    disabled={bulkBusy}
                  >
                    On hold
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => bulkSetStatus(null)}
                    disabled={bulkBusy}
                  >
                    Clear status
                  </Button>
                  <Button variant="danger" size="sm" onClick={bulkDelete} disabled={bulkBusy}>
                    Delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                    Deselect all
                  </Button>
                </div>
              )}
              <div className="table-scroll">
                <table className="responses-table">
                  <thead>
                    <tr>
                      <th className="th-check">
                        <input
                          type="checkbox"
                          checked={selected.size === tableRows.length && tableRows.length > 0}
                          onChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </th>
                      <th>Status</th>
                      <th>Flags</th>
                      <th>Submitted</th>
                      {quizMode && <th>Score</th>}
                      {columns.map((col) => (
                        <th key={col.key}>{col.label}</th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.id} className={selected.has(row.id) ? "row-selected" : ""}>
                        <td className="td-check">
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            aria-label="Select row"
                          />
                        </td>
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
                        <td className="quality-flags-cell">
                          {(row.quality_flags ?? []).map((flag) => (
                            <span
                              key={flag}
                              className={`quality-flag quality-flag--${flag}`}
                              title={FLAG_TITLES[flag] ?? flag}
                            >
                              {FLAG_LABELS[flag] ?? flag}
                            </span>
                          ))}
                        </td>
                        <td className="muted">{new Date(row.created_at).toLocaleString()}</td>
                        {quizMode && <td className="score-cell">{scoreText(row)}</td>}
                        {columns.map((col) => (
                          <td key={col.key}>{col.value(row.answers)}</td>
                        ))}
                        <td className="row-actions">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                            Edit
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => onDeleteRow(row)}>
                            Delete
                          </Button>
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
      <Modal
        open={!!editState}
        onClose={() => !editState?.saving && setEditState(null)}
        title="Edit response"
        width="lg"
      >
        {editState && (
          <>
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
            {editState.error && <Alert tone="danger">{editState.error}</Alert>}
            {editHistory.length > 0 && (
              <details className="edit-history">
                <summary className="edit-history-summary">
                  Edit history ({editHistory.length})
                </summary>
                <div className="edit-history-list">
                  {editHistory.map((e) => (
                    <div key={e.id} className="edit-history-entry">
                      <span className="edit-history-time">
                        {new Date(e.created_at).toLocaleString()}
                      </span>
                      <span className="edit-history-fields">
                        {e.changed_fields.join(", ")} changed
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            <div className="edit-footer">
              <Button variant="primary" onClick={saveEdit} loading={editState.saving}>
                Save changes
              </Button>
              <Button
                variant="ghost"
                onClick={() => setEditState(null)}
                disabled={editState.saving}
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}

import { type SubmissionRow, api } from "@/api/client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

type WidgetType = "bar" | "pie" | "number" | "text";
interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  field: string;
  text?: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function valueCounts(rows: SubmissionRow[], field: string): { label: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const v = row.answers[field];
    const key = v === null || v === undefined ? "(empty)" : String(v);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function BarWidget({ rows, widget }: { rows: SubmissionRow[]; widget: Widget }) {
  const data = valueCounts(rows, widget.field);
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="rpt-bar-chart">
      {data.map((d) => (
        <div key={d.label} className="rpt-bar-row">
          <span className="rpt-bar-label">{d.label}</span>
          <div className="rpt-bar-track">
            <div className="rpt-bar-fill" style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
          <span className="rpt-bar-val">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function PieWidget({ rows, widget }: { rows: SubmissionRow[]; widget: Widget }) {
  const data = valueCounts(rows, widget.field);
  const total = data.reduce((s, d) => s + d.count, 0);
  const COLORS = ["#4f6ef7", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];
  let offset = 0;
  const slices = data.map((d, i) => {
    const pct = total > 0 ? d.count / total : 0;
    const startAngle = offset * 360;
    offset += pct;
    const endAngle = offset * 360;
    const large = endAngle - startAngle > 180 ? 1 : 0;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = 50 + 40 * Math.cos(toRad(startAngle - 90));
    const y1 = 50 + 40 * Math.sin(toRad(startAngle - 90));
    const x2 = 50 + 40 * Math.cos(toRad(endAngle - 90));
    const y2 = 50 + 40 * Math.sin(toRad(endAngle - 90));
    return {
      d: `M50,50 L${x1},${y1} A40,40,0,${large},1,${x2},${y2}Z`,
      color: COLORS[i % COLORS.length],
      label: d.label,
      count: d.count,
      pct: Math.round(pct * 100),
    };
  });
  return (
    <div className="rpt-pie-wrap">
      <svg viewBox="0 0 100 100" className="rpt-pie-svg" aria-label={widget.title}>
        <title>{widget.title}</title>
        {slices.map((s) => (
          <path key={s.label} d={s.d} fill={s.color} />
        ))}
      </svg>
      <ul className="rpt-pie-legend">
        {slices.map((s, i) => (
          <li key={s.label}>
            <span className="rpt-pie-dot" style={{ background: COLORS[i % COLORS.length] }} />
            {s.label} — {s.pct}%
          </li>
        ))}
      </ul>
    </div>
  );
}

function NumberWidget({ rows, widget }: { rows: SubmissionRow[]; widget: Widget }) {
  const vals = rows.map((r) => Number(r.answers[widget.field])).filter((v) => !Number.isNaN(v));
  const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  return (
    <div className="rpt-number">
      <div className="rpt-number-val">{avg !== null ? avg.toFixed(1) : "—"}</div>
      <div className="rpt-number-label">avg · {vals.length} responses</div>
    </div>
  );
}

function WidgetCard({
  widget,
  rows,
  fields,
  onUpdate,
  onRemove,
  editMode,
}: {
  widget: Widget;
  rows: SubmissionRow[];
  fields: string[];
  onUpdate: (w: Widget) => void;
  onRemove: () => void;
  editMode: boolean;
}) {
  return (
    <div className="rpt-widget">
      <div className="rpt-widget-head">
        {editMode ? (
          <input
            className="rpt-widget-title-input"
            value={widget.title}
            onChange={(e) => onUpdate({ ...widget, title: e.target.value })}
          />
        ) : (
          <h3 className="rpt-widget-title">{widget.title}</h3>
        )}
        {editMode && (
          <button type="button" className="rpt-remove" onClick={onRemove} title="Remove">
            ×
          </button>
        )}
      </div>
      {editMode && widget.type !== "text" && (
        <select
          className="rpt-field-select"
          value={widget.field}
          onChange={(e) => onUpdate({ ...widget, field: e.target.value })}
        >
          {fields.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      )}
      {widget.type === "bar" && <BarWidget rows={rows} widget={widget} />}
      {widget.type === "pie" && <PieWidget rows={rows} widget={widget} />}
      {widget.type === "number" && <NumberWidget rows={rows} widget={widget} />}
      {widget.type === "text" &&
        (editMode ? (
          <textarea
            className="rpt-text-input"
            value={widget.text ?? ""}
            onChange={(e) => onUpdate({ ...widget, text: e.target.value })}
          />
        ) : (
          <p className="rpt-text-body">{widget.text}</p>
        ))}
    </div>
  );
}

export function ReportPage() {
  const { formId } = useParams<{ formId: string }>();
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [editMode, setEditMode] = useState(true);

  const fields = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r.answers)) keys.add(k);
    return Array.from(keys);
  }, [rows]);

  useEffect(() => {
    if (!formId) return;
    api
      .listSubmissions(formId)
      .then(setRows)
      .catch(() => {});
  }, [formId]);

  function addWidget(type: WidgetType) {
    const field = fields[0] ?? "";
    setWidgets((prev) => [
      ...prev,
      { id: uid(), type, title: type === "text" ? "Note" : `${type} — ${field}`, field, text: "" },
    ]);
  }

  function updateWidget(id: string, w: Widget) {
    setWidgets((prev) => prev.map((x) => (x.id === id ? w : x)));
  }

  function removeWidget(id: string) {
    setWidgets((prev) => prev.filter((x) => x.id !== id));
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="rpt-page">
      <div className="rpt-toolbar no-print">
        <h2 className="rpt-page-title">Report</h2>
        <div className="rpt-toolbar-actions">
          {editMode && (
            <>
              <button type="button" className="rpt-add-btn" onClick={() => addWidget("bar")}>
                + Bar
              </button>
              <button type="button" className="rpt-add-btn" onClick={() => addWidget("pie")}>
                + Pie
              </button>
              <button type="button" className="rpt-add-btn" onClick={() => addWidget("number")}>
                + KPI
              </button>
              <button type="button" className="rpt-add-btn" onClick={() => addWidget("text")}>
                + Text
              </button>
            </>
          )}
          <button type="button" className="link-button" onClick={() => setEditMode((e) => !e)}>
            {editMode ? "Preview" : "Edit"}
          </button>
          <button type="button" className="btn-primary" onClick={handlePrint}>
            Print / PDF
          </button>
        </div>
      </div>

      {widgets.length === 0 && <p className="rpt-empty">Add widgets above to build your report.</p>}

      <div className="rpt-grid">
        {widgets.map((w) => (
          <WidgetCard
            key={w.id}
            widget={w}
            rows={rows}
            fields={fields}
            onUpdate={(updated) => updateWidget(w.id, updated)}
            onRemove={() => removeWidget(w.id)}
            editMode={editMode}
          />
        ))}
      </div>
    </div>
  );
}

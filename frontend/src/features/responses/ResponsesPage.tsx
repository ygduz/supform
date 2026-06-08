import { useParams } from "react-router-dom";

/**
 * Results view. Scaffold only — M2 adds a submissions table, per-question summaries,
 * charts, and export buttons (CSV/XLSX/JSON via the backend exporters).
 */
export function ResponsesPage() {
  const { formId } = useParams();
  return (
    <section className="responses">
      <h1>Responses</h1>
      <p className="muted">Results for form <code>{formId}</code> will appear here.</p>
      <ul>
        <li>Submissions table (sortable, filterable)</li>
        <li>Per-question summaries &amp; charts</li>
        <li>Export to CSV / XLSX / JSON</li>
      </ul>
    </section>
  );
}

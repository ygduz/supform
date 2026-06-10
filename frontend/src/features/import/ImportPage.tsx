import { api, isAuthenticated } from "@/api/client";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

/** Pick the importer from the file extension (.xlsx/.xls -> XLSForm, .xml -> ODK XForm). */
function importerFor(filename: string): "xlsform" | "xform" | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsform";
  if (lower.endsWith(".xml")) return "xform";
  return null;
}

/** Find the user's first project or create a default one to hold imported forms. */
async function resolveProjectId(): Promise<string> {
  const projects = await api.listProjects();
  if (projects.length > 0) return projects[0].id;
  return (await api.createProject("My forms")).id;
}

/** Upload an XLSForm or ODK XForm and open the resulting draft in the builder. */
export function ImportPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated()) {
    return (
      <section>
        <h1>Import a form</h1>
        <p className="muted">
          Please <Link to="/login">sign in</Link> to import a form.
        </p>
      </section>
    );
  }

  const kind = file ? importerFor(file.name) : null;

  async function onImport() {
    if (!file) return;
    const importer = importerFor(file.name);
    if (!importer) {
      setError("Unsupported file. Upload an XLSForm (.xlsx) or ODK XForm (.xml).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const projectId = await resolveProjectId();
      const { id } = await api.importForm(importer, projectId, file);
      navigate(`/builder/${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="import-page">
      <h1>Import a form</h1>
      <p className="muted">
        Bring in a form from the ODK / KoboToolbox ecosystem. Supported: XLSForm (<code>.xlsx</code>
        ) and ODK XForm (<code>.xml</code>).
      </p>

      <input
        type="file"
        accept=".xlsx,.xls,.xml"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setError(null);
        }}
      />

      {file && kind && (
        <p className="muted">
          Detected: <strong>{kind === "xlsform" ? "XLSForm" : "ODK XForm"}</strong>
        </p>
      )}
      {file && !kind && <p className="error">Unsupported file type.</p>}
      {error && <p className="error">{error}</p>}

      <button type="button" className="button" onClick={onImport} disabled={!file || !kind || busy}>
        {busy ? "Importing…" : "Import & open in builder"}
      </button>
    </section>
  );
}

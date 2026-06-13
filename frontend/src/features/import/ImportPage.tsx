import { api, isAuthenticated } from "@/api/client";
import { useBuilderStore } from "@/stores/builderStore";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { parseTextForm, summarize } from "./textForm";

const SAMPLE = `# Customer feedback
* About you
- Your name *
- Email (email) *
* Your visit
- How did we do?
  • Great
  • OK
  • Poor
- What could be better? (paragraph)
> Optional — tell us more`;

/** Extract plain text from a pasted string or an uploaded .txt/.md/.docx file. */
async function readFormText(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith(".docx")) {
    const mammoth = await import("mammoth/mammoth.browser");
    const buffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
    return value;
  }
  return file.text();
}

/**
 * Author-in-Word / plain-text importer. Questions start with `-`, choices with `•`,
 * sections with `*` — parsed entirely client-side and opened in the builder.
 */
function TextFormImport() {
  const navigate = useNavigate();
  const loadTemplate = useBuilderStore((s) => s.loadTemplate);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const schema = useMemo(() => parseTextForm(text), [text]);
  const counts = summarize(schema);
  const hasContent = counts.questions > 0 || counts.sections > 0;

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      setText(await readFormText(file));
    } catch {
      setError("Couldn't read that file. Use a .docx, .txt, or .md file — or paste the text.");
    }
  }

  function openInBuilder() {
    loadTemplate(schema);
    navigate("/builder/new");
  }

  return (
    <section className="text-import">
      <h2>Author in Word or plain text</h2>
      <p className="muted">
        Write your form in Word or any text editor, then bring it in. Start a question with{" "}
        <code>-</code>, a choice with <code>•</code>, and a section with <code>*</code>. Add a type
        like <code>(email)</code> or <code>(paragraph)</code>, and end a line with <code>*</code> to
        make it required.
      </p>

      <div className="text-import-tools">
        <input
          type="file"
          accept=".docx,.txt,.md,text/plain"
          onChange={(e) => {
            onFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <button type="button" className="link-button" onClick={() => setText(SAMPLE)}>
          Paste a sample
        </button>
      </div>

      <textarea
        className="text-import-area"
        value={text}
        placeholder={"# My form\n* Section\n- A question *\n  • Choice one\n  • Choice two"}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        spellCheck={false}
      />

      {error && <p className="error">{error}</p>}

      {hasContent && (
        <div className="text-import-preview">
          <span className="muted">
            Detected <strong>{counts.questions}</strong>{" "}
            {counts.questions === 1 ? "question" : "questions"}
            {counts.sections > 0 && (
              <>
                {" "}
                in <strong>{counts.sections}</strong>{" "}
                {counts.sections === 1 ? "section" : "sections"}
              </>
            )}
            .
          </span>
          <button type="button" className="button" onClick={openInBuilder}>
            Open in builder
          </button>
        </div>
      )}
    </section>
  );
}

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

      <hr className="import-divider" />

      <TextFormImport />
    </section>
  );
}

import { type FormListItem, api, isAuthenticated } from "@/api/client";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type Status = "loading" | "ready" | "error";
type SortKey = "updated" | "created" | "responses" | "title";

/** Deterministic pastel gradient from a string. */
function cardGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue},60%,72%), hsl(${hue2},65%,62%))`;
}

/** Initials from a form title (up to 2 chars). */
function initials(title: string): string {
  const words = title.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return title.slice(0, 2).toUpperCase() || "F";
}

/** The home dashboard: every form you own or collaborate on, searchable, with actions. */
export function FormsPage() {
  const navigate = useNavigate();
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.listForms();
        if (!cancelled) {
          setForms(rows);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? forms.filter((f) => f.title.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
      : forms;
    return [...filtered].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "responses") return b.response_count - a.response_count;
      if (sort === "created") return b.created_at.localeCompare(a.created_at);
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [forms, query, sort]);

  async function onDuplicate(form: FormListItem) {
    setError(null);
    try {
      const copy = await api.duplicateForm(form.id);
      // Navigate straight to the builder for the new copy.
      window.location.href = `/builder/${copy.id}`;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onDelete(form: FormListItem) {
    const ok = window.confirm(
      `Delete "${form.title}" and all of its responses? This cannot be undone.`,
    );
    if (!ok) return;
    setError(null);
    try {
      await api.deleteForm(form.id);
      setForms((prev) => prev.filter((f) => f.id !== form.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!isAuthenticated()) {
    return (
      <section>
        <h1>My forms</h1>
        <p className="muted">
          Please <Link to="/login">sign in</Link> to see your forms.
        </p>
      </section>
    );
  }

  if (status === "loading") return <p className="muted">Loading your forms…</p>;

  return (
    <section className="forms-dashboard">
      <header className="dashboard-header">
        <div>
          <h1>My forms</h1>
          <p className="muted">
            {forms.length} {forms.length === 1 ? "form" : "forms"}
          </p>
        </div>
        <div className="dashboard-actions">
          {forms.length > 0 && (
            <>
              <input
                type="search"
                placeholder="Search forms…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search forms"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort forms"
                className="sort-select"
              >
                <option value="updated">Last edited</option>
                <option value="created">Newest first</option>
                <option value="responses">Most responses</option>
                <option value="title">A → Z</option>
              </select>
            </>
          )}
          <Link className="button" to="/templates">
            + New form
          </Link>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {forms.length === 0 ? (
        <div className="dashboard-empty">
          <h2>Create your first form</h2>
          <p className="muted">Start from a template or build from scratch.</p>
          <div className="home-actions">
            <Link className="button" to="/templates">
              Browse templates
            </Link>
            <Link className="button secondary" to="/builder/new">
              Start from scratch
            </Link>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="muted empty">No forms match “{query}”.</p>
      ) : (
        <div className="forms-grid">
          {visible.map((form) => (
            <article key={form.id} className="form-card">
              <button
                type="button"
                className="form-card-main"
                onClick={() => navigate(`/builder/${form.id}`)}
              >
                <div
                  className="form-card-thumb"
                  style={{ background: cardGradient(form.id) }}
                  aria-hidden="true"
                >
                  <span className="form-card-initials">{initials(form.title || "?")}</span>
                </div>
                <div className="form-card-body">
                  <span className={`status-badge ${form.status}`}>{form.status}</span>
                  <h2>{form.title || "Untitled form"}</h2>
                  <p className="form-card-meta">
                    <span className="form-card-responses">
                      <strong>{form.response_count}</strong>{" "}
                      {form.response_count === 1 ? "response" : "responses"}
                    </span>
                    <span className="muted">
                      · {new Date(form.updated_at).toLocaleDateString()}
                    </span>
                  </p>
                </div>
              </button>
              <footer className="form-card-actions">
                <Link to={`/builder/${form.id}`}>Edit</Link>
                {form.status === "published" && <Link to={`/f/${form.id}`}>Preview</Link>}
                <Link to={`/forms/${form.id}/responses`}>Responses</Link>
                {form.status === "published" && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      navigator.clipboard?.writeText(`${window.location.origin}/f/${form.id}`)
                    }
                  >
                    Copy link
                  </button>
                )}
                <button type="button" className="link-button" onClick={() => onDuplicate(form)}>
                  Duplicate
                </button>
                <button type="button" className="link-button danger" onClick={() => onDelete(form)}>
                  Delete
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

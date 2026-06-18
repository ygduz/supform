import { type QuestionTemplate, api } from "@/api/client";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { useEffect, useMemo, useState } from "react";
import { fieldMeta } from "./fieldMeta";

interface Props {
  onClose: () => void;
}

const typeLabel = (type: string): string => fieldMeta(type).label;

export function QuestionLibraryPanel({ onClose }: Props) {
  const insertElement = useBuilderStore((s) => s.insertElement);
  const [templates, setTemplates] = useState<QuestionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [preview, setPreview] = useState<QuestionTemplate | null>(null);

  useEffect(() => {
    api
      .listQuestionTemplates()
      .then(setTemplates)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const distinctTypes = useMemo(
    () => ["all", ...Array.from(new Set(templates.map((t) => String(t.element.type ?? ""))))],
    [templates],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return templates.filter((t) => {
      const matchSearch = !q || t.label.toLowerCase().includes(q);
      const matchType = typeFilter === "all" || String(t.element.type ?? "") === typeFilter;
      return matchSearch && matchType;
    });
  }, [templates, search, typeFilter]);

  function insertTemplate(tpl: QuestionTemplate) {
    insertElement(tpl.element as unknown as Element);
    onClose();
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Remove this template from the library?")) return;
    try {
      await api.deleteQuestionTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (preview?.id === id) setPreview(null);
    } catch (e) {
      alert(String(e));
    }
  }

  return (
    <div className="ql-panel">
      <div className="ql-header">
        <h3>Question Library</h3>
        <button type="button" className="ql-close" onClick={onClose} title="Close">
          ×
        </button>
      </div>

      <div className="ql-toolbar">
        <input
          className="ql-search"
          type="search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="ql-type-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          {distinctTypes.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All types" : typeLabel(t)}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="ql-msg">Loading…</p>}
      {error && <p className="ql-msg ql-error">{error}</p>}
      {!loading && !error && templates.length === 0 && (
        <p className="ql-msg ql-empty">
          No saved questions yet. Click <strong>☆</strong> on any question card to save it here.
        </p>
      )}
      {!loading && !error && templates.length > 0 && filtered.length === 0 && (
        <p className="ql-msg ql-empty">No questions match your search.</p>
      )}

      <div className="ql-body">
        <ul className="ql-list">
          {filtered.map((tpl) => (
            <li
              key={tpl.id}
              className={`ql-item${preview?.id === tpl.id ? " ql-item--selected" : ""}`}
            >
              <button
                type="button"
                className="ql-preview-btn"
                onClick={() => setPreview(preview?.id === tpl.id ? null : tpl)}
                title="Preview"
              >
                <span className="ql-label">{tpl.label}</span>
                <span className="ql-type">{typeLabel(String(tpl.element.type ?? ""))}</span>
              </button>
              <div className="ql-actions">
                <button
                  type="button"
                  className="ql-insert"
                  onClick={() => insertTemplate(tpl)}
                  title="Add to form"
                >
                  + Add
                </button>
                <button
                  type="button"
                  className="ql-delete"
                  title="Remove from library"
                  onClick={() => deleteTemplate(tpl.id)}
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>

        {preview && (
          <div className="ql-preview-pane">
            <h4 className="ql-preview-title">Preview</h4>
            <div className="ql-preview-card">
              <p className="ql-preview-label">{preview.label}</p>
              <span className="ql-type">{typeLabel(String(preview.element.type ?? ""))}</span>
              {Array.isArray((preview.element as { options?: unknown[] }).options) && (
                <ul className="ql-preview-opts">
                  {(preview.element as { options: { label?: string; value?: string }[] }).options
                    .slice(0, 5)
                    .map((o) => (
                      <li key={o.value ?? o.label}>○ {o.label ?? o.value}</li>
                    ))}
                  {(preview.element as { options: unknown[] }).options.length > 5 && (
                    <li className="ql-preview-more">
                      +{(preview.element as { options: unknown[] }).options.length - 5} more
                    </li>
                  )}
                </ul>
              )}
              {(preview.element as { required?: boolean }).required && (
                <span className="ql-preview-badge">Required</span>
              )}
            </div>
            <button
              type="button"
              className="btn-primary ql-insert-preview"
              onClick={() => insertTemplate(preview)}
            >
              Add to form
            </button>
          </div>
        )}
      </div>

      <p className="ql-count">
        {filtered.length} of {templates.length} saved
      </p>
    </div>
  );
}

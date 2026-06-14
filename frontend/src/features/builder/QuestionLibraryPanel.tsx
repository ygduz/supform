import { type QuestionTemplate, api } from "@/api/client";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { useEffect, useState } from "react";

interface Props {
  onClose: () => void;
}

export function QuestionLibraryPanel({ onClose }: Props) {
  const insertElement = useBuilderStore((s) => s.insertElement);
  const [templates, setTemplates] = useState<QuestionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listQuestionTemplates()
      .then(setTemplates)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function insertTemplate(tpl: QuestionTemplate) {
    insertElement(tpl.element as unknown as Element);
    onClose();
  }

  async function deleteTemplate(id: string) {
    try {
      await api.deleteQuestionTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      alert(String(e));
    }
  }

  return (
    <div className="ql-panel">
      <div className="ql-header">
        <h3>Question Library</h3>
      </div>

      {loading && <p className="ql-msg">Loading…</p>}
      {error && <p className="ql-msg ql-error">{error}</p>}
      {!loading && !error && templates.length === 0 && (
        <p className="ql-msg ql-empty">
          No saved questions yet. Click <strong>☆</strong> on any question card to save it here.
        </p>
      )}

      <ul className="ql-list">
        {templates.map((tpl) => (
          <li key={tpl.id} className="ql-item">
            <button type="button" className="ql-insert" onClick={() => insertTemplate(tpl)}>
              <span className="ql-label">{tpl.label}</span>
              <span className="ql-type">{String(tpl.element.type ?? "")}</span>
            </button>
            <button
              type="button"
              className="ql-delete"
              title="Remove from library"
              onClick={() => deleteTemplate(tpl.id)}
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useBuilderStore } from "@/stores/builderStore";
import type { FormSchema } from "@/types/form-schema";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AIGenerateDialog } from "./AIGenerateDialog";
import { type SavedTemplate, deleteMyTemplate, listMyTemplates } from "./myTemplates";
import { TEMPLATES } from "./templates";

/** A gallery of ready-made forms. Picking one seeds the builder with a draft to customize. */
export function TemplatesPage() {
  const navigate = useNavigate();
  const loadTemplate = useBuilderStore((s) => s.loadTemplate);
  const [mine, setMine] = useState<SavedTemplate[]>(() => listMyTemplates());
  const [aiOpen, setAiOpen] = useState(false);

  const use = (schema: FormSchema) => {
    loadTemplate(schema);
    navigate("/builder/new");
  };

  const onDeleteMine = (id: string) => {
    deleteMyTemplate(id);
    setMine(listMyTemplates());
  };

  return (
    <section className="templates">
      <h1>Start from a template</h1>
      <p className="muted">
        Pick a starting point and tweak it in the builder, or{" "}
        <button
          type="button"
          className="link-button inline"
          onClick={() => navigate("/builder/new")}
        >
          start from scratch
        </button>
        .
      </p>

      <div className="ai-cta">
        <button type="button" className="button" onClick={() => setAiOpen(true)}>
          ✨ Generate with AI
        </button>
      </div>
      {aiOpen && <AIGenerateDialog onClose={() => setAiOpen(false)} />}

      {mine.length > 0 && (
        <>
          <h2 className="section-title">My templates</h2>
          <div className="template-grid">
            {mine.map((t) => (
              <article key={t.id} className="template-card">
                <div className="template-icon" aria-hidden="true">
                  ⭐
                </div>
                <h2>{t.name}</h2>
                <p className="muted">Saved {new Date(t.savedAt).toLocaleDateString()}</p>
                <ul className="template-fields">
                  {t.schema.pages[0]?.elements.slice(0, 5).map((el) => (
                    <li key={el.name}>{typeof el.label === "string" ? el.label : el.name}</li>
                  ))}
                </ul>
                <div className="template-card-actions">
                  <button type="button" className="button" onClick={() => use(t.schema)}>
                    Use
                  </button>
                  <button
                    type="button"
                    className="link-button danger"
                    onClick={() => onDeleteMine(t.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <h2 className="section-title">Templates</h2>
      <div className="template-grid">
        {TEMPLATES.map((template) => (
          <article key={template.id} className="template-card">
            <div className="template-icon" aria-hidden="true">
              {template.icon}
            </div>
            <h2>{template.name}</h2>
            <p className="muted">{template.description}</p>
            <ul className="template-fields">
              {template.schema.pages[0].elements.slice(0, 5).map((el) => (
                <li key={el.name}>{typeof el.label === "string" ? el.label : el.name}</li>
              ))}
            </ul>
            <button type="button" className="button" onClick={() => use(template.schema)}>
              Use this template
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

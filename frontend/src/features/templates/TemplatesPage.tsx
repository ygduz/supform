import { useBuilderStore } from "@/stores/builderStore";
import { useNavigate } from "react-router-dom";
import { TEMPLATES, type Template } from "./templates";

/** A gallery of ready-made forms. Picking one seeds the builder with a draft to customize. */
export function TemplatesPage() {
  const navigate = useNavigate();
  const loadTemplate = useBuilderStore((s) => s.loadTemplate);

  const use = (template: Template) => {
    loadTemplate(template.schema);
    navigate("/builder/new");
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
            <button type="button" className="button" onClick={() => use(template)}>
              Use this template
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

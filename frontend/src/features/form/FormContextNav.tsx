import { Link, NavLink } from "react-router-dom";

/**
 * Form-context navigation: keeps the user anchored to "I am working on this form" while
 * moving between editing and reviewing responses — the MS-Forms tab model. Rendered at the
 * top of the response-side pages (Responses, Report); the builder links back via its toolbar.
 */
export function FormContextNav({
  formId,
  title,
  active,
}: {
  formId: string;
  title?: string;
  active: "edit" | "responses";
}) {
  return (
    <nav className="form-context-nav">
      <Link to="/forms" className="form-context-back">
        ← My forms
      </Link>
      {title ? <span className="form-context-title">{title}</span> : null}
      <div className="form-context-tabs">
        <NavLink to={`/builder/${formId}`} className={active === "edit" ? "active" : undefined}>
          Questions
        </NavLink>
        <NavLink
          to={`/forms/${formId}/responses`}
          className={active === "responses" ? "active" : undefined}
        >
          Responses
        </NavLink>
      </div>
    </nav>
  );
}

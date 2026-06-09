import { ApiError, api } from "@/api/client";
import { localize } from "@/lib/i18n";
import type { Element, FormSchema } from "@/types/form-schema";
import type { JSX } from "react";
import { useState } from "react";
import { evaluateBool } from "./expressions";
import { renderField } from "./fields/registry";
import { themeToStyle } from "./theme";
import { type FieldErrors, validateAnswers } from "./validation";

type Answers = Record<string, unknown>;

const PRESENTATIONAL = new Set(["note", "section", "html"]);

/**
 * The renderer turns a FormSchema into an interactive form. It is fully schema-driven:
 * field widgets come from a type registry, and visibility honors `visibleIf` live.
 */
export function FormRenderer({ schema, formId }: { schema: FormSchema; formId: string }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const setValue = (name: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [name]: value }));
    // Clear a field's error as soon as the user edits it.
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  // Local-only render targets (builder preview / built-in demo) never hit the API.
  const isLocal = formId === "demo" || formId === "preview";

  /** Render one element, descending into groups (a transparent answer scope). */
  function renderElement(el: Element): JSX.Element | null {
    if (!evaluateBool(el.visibleIf, answers)) return null;

    if (el.type === "group") {
      return (
        <fieldset className="group" key={el.name}>
          {el.label && <legend>{localize(el.label)}</legend>}
          {(el.elements ?? []).map(renderElement)}
        </fieldset>
      );
    }

    if (el.type === "repeat") {
      return (
        <div className="field" key={el.name}>
          {el.label && <span className="field-label">{localize(el.label)}</span>}
          <p className="muted">Repeating groups aren't editable in this preview yet.</p>
        </div>
      );
    }

    if (PRESENTATIONAL.has(el.type)) {
      return (
        <div className="field" key={el.name}>
          {el.label && <p className="presentational">{localize(el.label)}</p>}
        </div>
      );
    }

    return (
      <div className="field" key={el.name}>
        {el.label && (
          <label htmlFor={el.name}>
            {localize(el.label)}
            {el.required && " *"}
          </label>
        )}
        {renderField(el, answers[el.name], (v) => setValue(el.name, v), formId)}
        {el.hint && <small className="hint">{localize(el.hint)}</small>}
        {errors[el.name] && <small className="error field-error">{errors[el.name]}</small>}
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const found = validateAnswers(schema, answers);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});

    if (isLocal) {
      setSubmitted(true);
      return;
    }
    try {
      await api.submit(formId, answers);
      setSubmitted(true);
    } catch (err) {
      // The server re-validates: map any field-level 422 details back onto the fields.
      if (err instanceof ApiError && err.details && typeof err.details === "object") {
        setErrors(err.details as FieldErrors);
      } else {
        setFormError((err as Error).message);
      }
    }
  }

  if (submitted) {
    return (
      <p className="confirmation">{localize(schema.settings?.confirmationMessage) || "Thanks!"}</p>
    );
  }

  const theme = schema.theme;

  return (
    <form className="form-renderer" style={themeToStyle(theme)} onSubmit={handleSubmit}>
      {theme?.coverImage && <img className="form-cover" src={theme.coverImage} alt="" />}
      {theme?.logo && <img className="form-logo" src={theme.logo} alt="" />}
      <h1>{localize(schema.title)}</h1>
      {schema.description && <p className="muted">{localize(schema.description)}</p>}
      {schema.pages.flatMap((p) => p.elements).map(renderElement)}
      {formError && <p className="error">{formError}</p>}
      <button type="submit" className="button">
        {localize(schema.settings?.submitButtonText) || "Submit"}
      </button>
    </form>
  );
}

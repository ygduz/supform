import { api } from "@/api/client";
import { localize } from "@/lib/i18n";
import type { Element, FormSchema } from "@/types/form-schema";
import { useMemo, useState } from "react";
import { evaluateBool } from "./expressions";
import { renderField } from "./fields/registry";

type Answers = Record<string, unknown>;

/**
 * The renderer turns a FormSchema into an interactive form. It is fully schema-driven:
 * field widgets come from a type registry, and visibility honors `visibleIf` live.
 */
export function FormRenderer({ schema, formId }: { schema: FormSchema; formId: string }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);

  const setValue = (name: string, value: unknown) =>
    setAnswers((prev) => ({ ...prev, [name]: value }));

  const visibleElements = useMemo(
    () =>
      schema.pages.flatMap((p) => p.elements).filter((el) => evaluateBool(el.visibleIf, answers)),
    [schema, answers],
  );

  // Local-only render targets (builder preview / built-in demo) never hit the API.
  const isLocal = formId === "demo" || formId === "preview";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLocal) await api.submit(formId, answers);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <p className="confirmation">{localize(schema.settings?.confirmationMessage) || "Thanks!"}</p>
    );
  }

  return (
    <form className="form-renderer" onSubmit={handleSubmit}>
      <h1>{localize(schema.title)}</h1>
      {schema.description && <p className="muted">{localize(schema.description)}</p>}
      {visibleElements.map((el: Element) => (
        <div className="field" key={el.name}>
          {el.label && (
            <label htmlFor={el.name}>
              {localize(el.label)}
              {el.required && " *"}
            </label>
          )}
          {renderField(el, answers[el.name], (v) => setValue(el.name, v))}
          {el.hint && <small className="hint">{localize(el.hint)}</small>}
        </div>
      ))}
      <button type="submit" className="button">
        {localize(schema.settings?.submitButtonText) || "Submit"}
      </button>
    </form>
  );
}

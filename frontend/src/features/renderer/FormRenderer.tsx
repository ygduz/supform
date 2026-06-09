import { ApiError, api } from "@/api/client";
import { LanguageContext, formLanguages, languageLabel, localize } from "@/lib/i18n";
import { isNetworkError, queueSubmission } from "@/lib/offline";
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
  const [queuedOffline, setQueuedOffline] = useState(false);

  // Multi-language support: offer a switcher when the form declares >1 language.
  const languages = formLanguages(schema.languages, schema.defaultLanguage);
  const [lang, setLang] = useState(languages[0] ?? schema.defaultLanguage ?? "en");
  const L = (value: Parameters<typeof localize>[0]) => localize(value, lang);

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
          {el.label && <legend>{L(el.label)}</legend>}
          {(el.elements ?? []).map(renderElement)}
        </fieldset>
      );
    }

    if (el.type === "repeat") {
      const instances: Record<string, unknown>[] = Array.isArray(answers[el.name])
        ? (answers[el.name] as Record<string, unknown>[])
        : [];
      const min = el.repeat?.min ?? 0;
      const max = el.repeat?.max;

      const writeInstance = (i: number, childName: string, value: unknown) =>
        setValue(
          el.name,
          instances.map((inst, idx) => (idx === i ? { ...inst, [childName]: value } : inst)),
        );
      const addInstance = () => setValue(el.name, [...instances, {}]);
      const removeInstance = (i: number) =>
        setValue(
          el.name,
          instances.filter((_, idx) => idx !== i),
        );

      return (
        <fieldset className="repeat" key={el.name}>
          {el.label && <legend>{L(el.label)}</legend>}
          {instances.length === 0 && <p className="muted">No entries yet.</p>}
          {instances.map((inst, i) => {
            const scope = { ...answers, ...inst };
            return (
              <div className="repeat-instance" key={`${el.name}-${i}`}>
                <div className="repeat-instance-head">
                  <span className="muted">Entry {i + 1}</span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => removeInstance(i)}
                    disabled={instances.length <= min}
                  >
                    Remove
                  </button>
                </div>
                {(el.elements ?? []).map((child) => {
                  if (PRESENTATIONAL.has(child.type)) return null;
                  if (!evaluateBool(child.visibleIf, scope)) return null;
                  const errorKey = `${el.name}[${i}].${child.name}`;
                  return (
                    <div className="field" key={child.name}>
                      {child.label && (
                        <span className="field-label">
                          {L(child.label)}
                          {child.required && " *"}
                        </span>
                      )}
                      {renderField(
                        child,
                        inst[child.name],
                        (v) => writeInstance(i, child.name, v),
                        formId,
                      )}
                      {errors[errorKey] && (
                        <small className="error field-error">{errors[errorKey]}</small>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          <button
            type="button"
            className="link-button"
            onClick={addInstance}
            disabled={max != null && instances.length >= max}
          >
            + Add entry
          </button>
        </fieldset>
      );
    }

    if (PRESENTATIONAL.has(el.type)) {
      return (
        <div className="field" key={el.name}>
          {el.label && <p className="presentational">{L(el.label)}</p>}
        </div>
      );
    }

    return (
      <div className="field" key={el.name}>
        {el.label && (
          <label htmlFor={el.name}>
            {L(el.label)}
            {el.required && " *"}
          </label>
        )}
        {renderField(el, answers[el.name], (v) => setValue(el.name, v), formId)}
        {el.hint && <small className="hint">{L(el.hint)}</small>}
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
      } else if (isNetworkError(err)) {
        // Offline: keep the response locally; it syncs automatically when back online.
        queueSubmission(formId, answers);
        setQueuedOffline(true);
        setSubmitted(true);
      } else {
        setFormError((err as Error).message);
      }
    }
  }

  if (submitted) {
    if (queuedOffline) {
      return (
        <p className="confirmation">
          You appear to be offline. Your response was saved on this device and will be submitted
          automatically when you're back online.
        </p>
      );
    }
    return <p className="confirmation">{L(schema.settings?.confirmationMessage) || "Thanks!"}</p>;
  }

  const theme = schema.theme;

  return (
    <LanguageContext.Provider value={lang}>
      <form className="form-renderer" style={themeToStyle(theme)} onSubmit={handleSubmit}>
        {theme?.coverImage && <img className="form-cover" src={theme.coverImage} alt="" />}
        {theme?.logo && <img className="form-logo" src={theme.logo} alt="" />}
        {languages.length > 1 && (
          <div className="lang-switcher">
            <label htmlFor="form-language">Language</label>
            <select
              id="form-language"
              className="select"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              {languages.map((code) => (
                <option key={code} value={code}>
                  {languageLabel(code)}
                </option>
              ))}
            </select>
          </div>
        )}
        <h1>{L(schema.title)}</h1>
        {schema.description && <p className="muted">{L(schema.description)}</p>}
        {schema.pages.flatMap((p) => p.elements).map(renderElement)}
        {formError && <p className="error">{formError}</p>}
        <button type="submit" className="button">
          {L(schema.settings?.submitButtonText) || "Submit"}
        </button>
      </form>
    </LanguageContext.Provider>
  );
}

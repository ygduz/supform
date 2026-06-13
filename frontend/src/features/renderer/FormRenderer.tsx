import { ApiError, api } from "@/api/client";
import { LanguageContext, formLanguages, languageLabel, localize } from "@/lib/i18n";
import { isNetworkError, queueSubmission } from "@/lib/offline";
import type { Element, FormSchema, I18nString } from "@/types/form-schema";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { evaluateBool } from "./expressions";
import { renderField } from "./fields/registry";
import { elementIndex, pipe } from "./piping";
import { themeToStyle } from "./theme";
import { type FieldErrors, validateAnswers, validateElements } from "./validation";

type Answers = Record<string, unknown>;
type DisplayMode = "single" | "paged" | "oneQuestionPerScreen";

/** One screen of the stepped renderer: a page (paged mode) or a single question (OQPS). */
interface Step {
  key: string;
  title?: I18nString;
  description?: I18nString;
  elements: Element[];
}

const PRESENTATIONAL = new Set(["note", "section", "html"]);

/** Every answer-bearing name inside an element (descending groups/repeats). */
function collectNames(el: Element): string[] {
  const names = [el.name];
  for (const child of el.elements ?? []) names.push(...collectNames(child));
  return names;
}

/** Sum the scores of every chosen option (client-side mirror of the server's compute). */
function scoreFor(schema: FormSchema, answers: Answers): number {
  let total = 0;
  const walk = (els: Element[]) => {
    for (const el of els) {
      if (el.options) {
        const chosen = Array.isArray(answers[el.name]) ? answers[el.name] : [answers[el.name]];
        for (const opt of el.options) {
          if (typeof opt.score === "number" && (chosen as unknown[]).includes(opt.value)) {
            total += opt.score;
          }
        }
      }
      if (el.elements) walk(el.elements);
    }
  };
  for (const p of schema.pages) walk(p.elements);
  return total;
}

const NUMERIC_TYPES = new Set(["number", "integer", "decimal", "scale", "rating"]);

/** Coerce a URL-string prefill value to the shape a field of `type` expects. */
function coercePrefill(type: string, raw: string): unknown {
  if (NUMERIC_TYPES.has(type)) {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (type === "boolean") return raw === "true" || raw === "1" || raw === "yes";
  if (type === "multi_choice") return raw.split(",").map((s) => s.trim());
  return raw;
}

/** Seed answers from `?field=value` URL params and hidden-field defaults. */
function buildInitialAnswers(schema: FormSchema, search: string): Answers {
  const params = new URLSearchParams(search);
  const answers: Answers = {};
  const walk = (els: Element[]) => {
    for (const el of els) {
      if (params.has(el.name)) {
        answers[el.name] = coercePrefill(el.type, params.get(el.name) as string);
      } else if (el.type === "hidden" && el.defaultValue !== undefined) {
        answers[el.name] = el.defaultValue;
      }
      if (el.elements) walk(el.elements);
    }
  };
  for (const p of schema.pages) walk(p.elements);
  return answers;
}

/**
 * The renderer turns a FormSchema into an interactive form. It is fully schema-driven:
 * field widgets come from a type registry, and visibility honors `visibleIf` live.
 * Answers can be prefilled from URL query params (e.g. embeds, campaign links).
 */
export function FormRenderer({ schema, formId }: { schema: FormSchema; formId: string }) {
  const [answers, setAnswers] = useState<Answers>(() =>
    buildInitialAnswers(schema, typeof window !== "undefined" ? window.location.search : ""),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);

  // Multi-language support: offer a switcher when the form declares >1 language.
  const languages = formLanguages(schema.languages, schema.defaultLanguage);
  const [lang, setLang] = useState(languages[0] ?? schema.defaultLanguage ?? "en");
  const L = (value: Parameters<typeof localize>[0]) => localize(value, lang);
  // Answer piping: localize, then substitute {field} tokens. `scope` lets repeat
  // instances pipe their own row's values; defaults to the top-level answers.
  const pIndex = elementIndex(schema);
  const P = (value: Parameters<typeof localize>[0], scope: Answers = answers) =>
    pipe(localize(value, lang), pIndex, scope, lang);

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
    if (el.type === "hidden") return null; // carried in answers, never shown
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
                  if (PRESENTATIONAL.has(child.type) || child.type === "hidden") return null;
                  if (!evaluateBool(child.visibleIf, scope)) return null;
                  const errorKey = `${el.name}[${i}].${child.name}`;
                  return (
                    <div className="field" key={child.name}>
                      {child.label && (
                        <span className="field-label">
                          {P(child.label, scope)}
                          {child.required && " *"}
                        </span>
                      )}
                      {renderField(
                        child,
                        inst[child.name],
                        (v) => writeInstance(i, child.name, v),
                        formId,
                        scope,
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
          {el.label && <p className="presentational">{P(el.label)}</p>}
        </div>
      );
    }

    return (
      <div className="field" key={el.name}>
        {el.label && (
          <label htmlFor={el.name}>
            {P(el.label)}
            {el.required && " *"}
          </label>
        )}
        {renderField(el, answers[el.name], (v) => setValue(el.name, v), formId, answers)}
        {el.hint && <small className="hint">{P(el.hint)}</small>}
        {errors[el.name] && <small className="error field-error">{errors[el.name]}</small>}
      </div>
    );
  }

  // ---- stepped display (paged / one-question-per-screen) ----
  const settings = schema.settings;
  const mode: DisplayMode =
    (settings?.displayMode as DisplayMode) ?? (schema.pages.length > 1 ? "paged" : "single");
  const visiblePages = schema.pages.filter((p) => evaluateBool(p.visibleIf, answers));

  let steps: Step[];
  if (mode === "paged" && visiblePages.length > 1) {
    steps = visiblePages.map((p) => ({
      key: p.name,
      title: p.title,
      description: p.description,
      elements: p.elements,
    }));
  } else if (mode === "oneQuestionPerScreen") {
    steps = visiblePages
      .flatMap((p) => p.elements)
      .filter((el) => evaluateBool(el.visibleIf, answers))
      .map((el) => ({ key: el.name, elements: [el] }));
  } else {
    steps = [{ key: "all", elements: visiblePages.flatMap((p) => p.elements) }];
  }

  // Visibility can change with answers; never point past the end.
  const stepIndex = Math.min(step, steps.length - 1);
  const current = steps[stepIndex] ?? { key: "empty", elements: [] };
  const isLastStep = stepIndex >= steps.length - 1;

  /** Jump to the first step containing any of the errored fields (after full validation). */
  function stepFor(errorKeys: string[]): number {
    return steps.findIndex((s) =>
      s.elements.some((el) => collectNames(el).some((n) => errorKeys.includes(n))),
    );
  }

  function goNext() {
    const found = validateElements(current.elements, answers);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    setStep(Math.min(stepIndex + 1, steps.length - 1));
  }

  function goBack() {
    setFormError(null);
    setStep(Math.max(0, stepIndex - 1));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Enter inside an input submits the form; on intermediate steps that means "next".
    if (!isLastStep) {
      goNext();
      return;
    }
    setFormError(null);

    const found = validateAnswers(schema, answers);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      const target = stepFor(Object.keys(found));
      if (target >= 0 && target !== stepIndex) setStep(target);
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

  const theme = schema.theme;
  const hasWelcome = Boolean(settings?.welcomeTitle || settings?.welcomeMessage);

  // Quiz scoring: pick the matching outcome band; its redirect (if any) wins.
  const quizScore = settings?.quizMode ? scoreFor(schema, answers) : null;
  const outcome =
    quizScore !== null
      ? (settings?.outcomes ?? []).find((o) => quizScore >= o.min && quizScore <= o.max)
      : undefined;
  const redirectUrl = outcome?.redirectUrl ?? settings?.redirectUrl;

  // After a successful (online) submit, optionally bounce to the configured URL.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once on success only.
  useEffect(() => {
    if (submitted && !queuedOffline && !isLocal && redirectUrl) {
      const t = setTimeout(() => {
        window.location.href = redirectUrl;
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [submitted]);

  if (submitted) {
    if (queuedOffline) {
      return (
        <p className="confirmation">
          You appear to be offline. Your response was saved on this device and will be submitted
          automatically when you're back online.
        </p>
      );
    }
    return (
      <div className="confirmation">
        {settings?.quizMode && (
          <p className="quiz-score">
            Your score: <strong>{quizScore}</strong>
          </p>
        )}
        <p>{L(outcome?.message) || L(settings?.confirmationMessage) || "Thanks!"}</p>
        {redirectUrl && !isLocal && <span className="muted redirect-note">Redirecting…</span>}
      </div>
    );
  }

  // Welcome screen (paged / one-question modes): a cover + title + Start button.
  if (hasWelcome && !started && mode !== "single") {
    return (
      <div className="form-renderer welcome-screen" style={themeToStyle(theme)}>
        {theme?.coverImage && <img className="form-cover" src={theme.coverImage} alt="" />}
        {theme?.logo && <img className="form-logo" src={theme.logo} alt="" />}
        <h1>{L(settings?.welcomeTitle) || L(schema.title)}</h1>
        {settings?.welcomeMessage && <p className="muted">{L(settings.welcomeMessage)}</p>}
        <button type="button" className="button" onClick={() => setStarted(true)}>
          Start
        </button>
      </div>
    );
  }

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

        {settings?.showProgressBar && steps.length > 1 && (
          <progress
            className="form-progress"
            value={stepIndex + 1}
            max={steps.length}
            aria-label="Form progress"
          />
        )}

        <div className="form-step" key={current.key}>
          {steps.length > 1 && current.title && <h2 className="page-title">{L(current.title)}</h2>}
          {steps.length > 1 && current.description && (
            <p className="muted">{L(current.description)}</p>
          )}
          {current.elements.map(renderElement)}
        </div>

        {formError && <p className="error">{formError}</p>}

        {steps.length > 1 ? (
          <div className="step-nav">
            <button
              type="button"
              className="button secondary"
              onClick={goBack}
              disabled={stepIndex === 0}
            >
              Back
            </button>
            <span className="muted step-count">
              {stepIndex + 1} / {steps.length}
            </span>
            {isLastStep ? (
              <button type="submit" className="button">
                {L(settings?.submitButtonText) || "Submit"}
              </button>
            ) : (
              <button type="button" className="button" onClick={goNext}>
                Next
              </button>
            )}
          </div>
        ) : (
          <button type="submit" className="button">
            {L(settings?.submitButtonText) || "Submit"}
          </button>
        )}
      </form>
    </LanguageContext.Provider>
  );
}

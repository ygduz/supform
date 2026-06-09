/**
 * Client-side submission validation for instant feedback.
 *
 * This mirrors the backend's authoritative rules (app/form_engine/submissions.py) closely
 * enough to catch errors before a round-trip; the server still re-validates every
 * submission, so this is purely a UX layer. Errors are keyed by element name to match the
 * 422 `error.details` map the API returns, so both sources can populate the same state.
 */
import { localize } from "@/lib/i18n";
import type { Element, FormSchema, I18nString } from "@/types/form-schema";
import { evaluateBool } from "./expressions";

export type FieldErrors = Record<string, string>;

const PRESENTATIONAL = new Set(["note", "section", "html", "group", "calculated"]);

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function message(custom: I18nString | undefined, fallback: string): string {
  return localize(custom) || fallback;
}

/** Validate the answers against the (top-level) elements the renderer displays. */
export function validateAnswers(schema: FormSchema, answers: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = {};
  for (const el of schema.pages.flatMap((p) => p.elements)) {
    if (PRESENTATIONAL.has(el.type)) continue;
    if (!evaluateBool(el.visibleIf, answers)) continue;
    const error = validateField(el, answers[el.name], answers);
    if (error) errors[el.name] = error;
  }
  return errors;
}

function validateField(el: Element, value: unknown, ctx: Record<string, unknown>): string | null {
  const required =
    el.required === true || (el.requiredIf ? evaluateBool(el.requiredIf, ctx) : false);
  if (isEmpty(value)) return required ? "This field is required." : null;

  const v = el.validation;

  if (el.type === "multi_choice") {
    const count = Array.isArray(value) ? value.length : 0;
    if (v?.minSelected != null && count < v.minSelected)
      return message(v.message, `Select at least ${v.minSelected}.`);
    if (v?.maxSelected != null && count > v.maxSelected)
      return message(v.message, `Select at most ${v.maxSelected}.`);
    return null;
  }

  if (el.type === "matrix") {
    if (required) {
      const answered = (value ?? {}) as Record<string, unknown>;
      const missing = (el.rows ?? []).some((row) => isEmpty(answered[String(row.value)]));
      if (missing) return "Please answer every row.";
    }
    return null;
  }

  if (v) {
    if (typeof value === "number") {
      if (v.min != null && value < v.min) return message(v.message, `Must be ≥ ${v.min}.`);
      if (v.max != null && value > v.max) return message(v.message, `Must be ≤ ${v.max}.`);
    }
    if (typeof value === "string") {
      if (v.minLength != null && value.length < v.minLength)
        return message(v.message, `Must be at least ${v.minLength} characters.`);
      if (v.maxLength != null && value.length > v.maxLength)
        return message(v.message, `Must be at most ${v.maxLength} characters.`);
      if (v.pattern && !new RegExp(`^(?:${v.pattern})$`).test(value))
        return message(v.message, "Invalid format.");
    }
  }

  return null;
}

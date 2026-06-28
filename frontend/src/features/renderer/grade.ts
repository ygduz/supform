/**
 * Client-side mirror of the backend quiz grader (app/form_engine/scoring.py).
 *
 * The server is authoritative — it grades every live submission and returns the result. This
 * mirror exists so the demo/preview renderer (which never hits the network) can show graded
 * results, and as a fallback if a submit response omits grading. Keep the two in lock-step.
 */

import type { FieldGrade, GradingResult } from "@/api/client";
import type { Element, FormSchema } from "@/types/form-schema";

const TEXT_TYPES = new Set(["text", "longtext", "email", "url", "phone"]);

function norm(value: unknown, type: string): unknown {
  if (TEXT_TYPES.has(type) && typeof value === "string") return value.trim().toLowerCase();
  return value;
}

/** True if the element declares a correct answer (and so participates in grading). */
export function isGraded(el: Element): boolean {
  if (el.correctAnswer !== undefined && el.correctAnswer !== null) return true;
  return (el.options ?? []).some((o) => o.correct === true);
}

function expectedValues(el: Element): unknown[] {
  if (el.correctAnswer !== undefined && el.correctAnswer !== null) {
    return Array.isArray(el.correctAnswer) ? el.correctAnswer : [el.correctAnswer];
  }
  return (el.options ?? []).filter((o) => o.correct === true).map((o) => o.value);
}

/** Grade one answer. Multi-select must match the correct set exactly. Points default to 1. */
export function gradeField(el: Element, value: unknown): FieldGrade {
  const points = typeof el.points === "number" ? el.points : 1;
  const expected = expectedValues(el);
  const want = new Set(expected.map((v) => norm(v, el.type)));
  let correct = false;
  if (Array.isArray(value)) {
    const got = new Set(value.map((v) => norm(v, el.type)));
    correct = got.size === want.size && [...got].every((v) => want.has(v));
  } else {
    correct = want.has(norm(value, el.type));
  }
  return { correct, earned: correct ? points : 0, points, correctAnswer: expected };
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Grade every answered, correct-answer question. Mirror of scoring.grade_submission. */
export function gradeForm(schema: FormSchema, answers: Record<string, unknown>): GradingResult {
  let earnedPoints = 0;
  let maxPoints = 0;
  let correctCount = 0;
  let gradedCount = 0;
  const perField: Record<string, FieldGrade> = {};

  const walk = (els: Element[]) => {
    for (const el of els) {
      if (isGraded(el) && !isEmpty(answers[el.name])) {
        const g = gradeField(el, answers[el.name]);
        gradedCount += 1;
        maxPoints += g.points;
        earnedPoints += g.earned;
        if (g.correct) correctCount += 1;
        perField[el.name] = g;
      }
      if (el.elements) walk(el.elements);
    }
  };
  for (const p of schema.pages) walk(p.elements);
  return { earnedPoints, maxPoints, correctCount, gradedCount, perField };
}

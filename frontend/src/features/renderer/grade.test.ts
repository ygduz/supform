import type { FormSchema } from "@/types/form-schema";
import { describe, expect, it } from "vitest";
import { gradeField, gradeForm, isGraded } from "./grade";

const el = (e: Record<string, unknown>) => e as never;

const schema = (): FormSchema => ({
  schemaVersion: "1.0",
  name: "exam",
  title: "Exam",
  settings: { quizMode: true },
  pages: [
    {
      name: "p1",
      elements: [
        {
          type: "single_choice",
          name: "capital",
          points: 2,
          options: [{ value: "paris", correct: true }, { value: "lyon" }],
        },
        {
          type: "multi_choice",
          name: "primes",
          options: [{ value: "2", correct: true }, { value: "3", correct: true }, { value: "4" }],
        },
        { type: "text", name: "river", correctAnswer: "Nile" },
        { type: "text", name: "ungraded" },
      ],
    },
  ],
});

describe("grade.ts (client mirror of backend scoring)", () => {
  it("detects graded questions", () => {
    expect(isGraded(el({ type: "text", correctAnswer: "x" }))).toBe(true);
    expect(isGraded(el({ type: "single_choice", options: [{ value: "a", correct: true }] }))).toBe(
      true,
    );
    expect(isGraded(el({ type: "text" }))).toBe(false);
  });

  it("grades single, multi (exact set), and case-insensitive text", () => {
    const s = schema();
    const [capital, primes, river] = s.pages[0].elements;
    expect(gradeField(capital, "paris")).toEqual({
      correct: true,
      earned: 2,
      points: 2,
      correctAnswer: ["paris"],
    });
    expect(gradeField(capital, "lyon").correct).toBe(false);
    expect(gradeField(primes, ["2", "3"]).correct).toBe(true);
    expect(gradeField(primes, ["2"]).correct).toBe(false);
    expect(gradeField(primes, ["2", "3", "4"]).correct).toBe(false);
    expect(gradeField(river, "  nile ").correct).toBe(true);
    expect(gradeField(river, "Amazon").correct).toBe(false);
  });

  it("summarizes a submission, ignoring unanswered + ungraded", () => {
    const g = gradeForm(schema(), { capital: "paris", primes: ["2"], river: "Nile" });
    expect(g.gradedCount).toBe(3);
    expect(g.correctCount).toBe(2);
    expect(g.maxPoints).toBe(4);
    expect(g.earnedPoints).toBe(3);

    const g2 = gradeForm(schema(), { capital: "paris", ungraded: "whatever" });
    expect(g2.gradedCount).toBe(1);
    expect(g2.maxPoints).toBe(2);
  });
});

import type { Element, FormSchema } from "@/types/form-schema";
import { describe, expect, it } from "vitest";
import { validateAnswers } from "./validation";

function form(elements: Element[]): FormSchema {
  return { name: "f", title: "F", pages: [{ name: "p1", elements }] } as FormSchema;
}

describe("validateAnswers", () => {
  it("flags an empty required field", () => {
    const errors = validateAnswers(form([{ type: "text", name: "q", required: true }]), {});
    expect(errors.q).toBeTruthy();
  });

  it("passes when a required field is answered", () => {
    const errors = validateAnswers(form([{ type: "text", name: "q", required: true }]), {
      q: "hi",
    });
    expect(errors.q).toBeUndefined();
  });

  it("does not require a field hidden by visibleIf", () => {
    const schema = form([
      { type: "integer", name: "age" },
      { type: "text", name: "detail", required: true, visibleIf: "age >= 18" },
    ]);
    expect(validateAnswers(schema, { age: 10 }).detail).toBeUndefined();
    expect(validateAnswers(schema, { age: 20 }).detail).toBeTruthy();
  });

  it("enforces numeric min/max", () => {
    const schema = form([{ type: "integer", name: "n", validation: { min: 0, max: 100 } }]);
    expect(validateAnswers(schema, { n: 150 }).n).toBeTruthy();
    expect(validateAnswers(schema, { n: 50 }).n).toBeUndefined();
  });

  it("enforces string maxLength and pattern", () => {
    const long = form([{ type: "text", name: "s", validation: { maxLength: 3 } }]);
    expect(validateAnswers(long, { s: "toolong" }).s).toBeTruthy();

    const pat = form([{ type: "text", name: "s", validation: { pattern: "[0-9]+" } }]);
    expect(validateAnswers(pat, { s: "abc" }).s).toBeTruthy();
    expect(validateAnswers(pat, { s: "123" }).s).toBeUndefined();
  });

  it("enforces multi_choice min/max selected", () => {
    const schema = form([
      {
        type: "multi_choice",
        name: "tags",
        options: [{ value: "a" }, { value: "b" }, { value: "c" }],
        validation: { minSelected: 2 },
      },
    ]);
    expect(validateAnswers(schema, { tags: ["a"] }).tags).toBeTruthy();
    expect(validateAnswers(schema, { tags: ["a", "b"] }).tags).toBeUndefined();
  });

  it("requires every matrix row when required", () => {
    const schema = form([
      {
        type: "matrix",
        name: "rate",
        required: true,
        rows: [{ value: "speed" }, { value: "ease" }],
        columns: [{ value: "low" }, { value: "high" }],
      },
    ]);
    expect(validateAnswers(schema, { rate: { speed: "high" } }).rate).toBeTruthy();
    expect(validateAnswers(schema, { rate: { speed: "high", ease: "low" } }).rate).toBeUndefined();
  });

  it("skips presentational and calculated fields", () => {
    const schema = form([
      { type: "note", name: "intro", label: "Hi" },
      { type: "calculated", name: "total", calculate: "1 + 1" },
    ]);
    expect(Object.keys(validateAnswers(schema, {}))).toHaveLength(0);
  });
});

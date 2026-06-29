import type { FormSchema } from "@/types/form-schema";
import { describe, expect, it } from "vitest";
import { lintForm } from "./lint";

const form = (elements: unknown[]): FormSchema =>
  ({
    schemaVersion: "1.0",
    name: "f",
    title: "F",
    pages: [{ name: "p1", elements }],
  }) as FormSchema;

const codes = (s: FormSchema) =>
  lintForm(s)
    .map((n) => n.code)
    .sort();

describe("lintForm (live form checker)", () => {
  it("passes a clean form", () => {
    const s = form([
      { type: "single_choice", name: "q1", options: [{ value: "a" }, { value: "b" }] },
      { type: "text", name: "q2", visibleIf: 'q1 == "a"' },
    ]);
    expect(lintForm(s)).toEqual([]);
  });

  it("does not flag the membership operator `in` as a dangling reference", () => {
    const s = form([
      { type: "text", name: "region" },
      { type: "text", name: "q", visibleIf: "region in ['North','South']" },
    ]);
    expect(lintForm(s)).toEqual([]);
  });

  it("flags a dangling reference to a deleted field", () => {
    const s = form([{ type: "text", name: "q2", visibleIf: 'ghost == "x"' }]);
    expect(codes(s)).toContain("dangling-ref");
  });

  it("flags a logic value that isn't one of the target's options", () => {
    const s = form([
      { type: "single_choice", name: "q1", options: [{ value: "a" }, { value: "b" }] },
      { type: "text", name: "q2", visibleIf: 'q1 == "zzz"' },
    ]);
    expect(codes(s)).toContain("stale-option-ref");
  });

  it("flags a contradictory and-rule that can never match", () => {
    const s = form([
      { type: "single_choice", name: "q1", options: [{ value: "a" }, { value: "b" }] },
      { type: "text", name: "q2", visibleIf: 'q1 == "a" and q1 == "b"' },
    ]);
    expect(codes(s)).toContain("contradiction");
  });

  it("flags duplicate field keys and duplicate option values", () => {
    const s = form([
      { type: "text", name: "dup" },
      { type: "text", name: "dup" },
      { type: "single_choice", name: "q", options: [{ value: "x" }, { value: "x" }] },
    ]);
    const c = codes(s);
    expect(c).toContain("duplicate-name");
    expect(c).toContain("duplicate-option");
  });

  it("flags a choice question with no options and an incomplete matrix", () => {
    const s = form([
      { type: "single_choice", name: "empty" },
      { type: "matrix", name: "m", rows: [{ value: "r" }] },
    ]);
    const c = codes(s);
    expect(c).toContain("no-options");
    expect(c).toContain("matrix-incomplete");
  });

  it("flags circular calculations", () => {
    const s = form([
      { type: "calculated", name: "a", calculate: "b + 1" },
      { type: "calculated", name: "b", calculate: "a + 1" },
    ]);
    expect(codes(s)).toContain("circular-calc");
  });

  it("flags a self-reference", () => {
    const s = form([{ type: "text", name: "q", visibleIf: 'q == "x"' }]);
    expect(codes(s)).toContain("self-ref");
  });

  it("orders errors before warnings", () => {
    const s = form([{ type: "text", name: "q", visibleIf: 'ghost == "x"', requiredIf: "q == 1" }]);
    const levels = lintForm(s).map((n) => n.level);
    expect(levels.indexOf("error")).toBeLessThan(levels.lastIndexOf("warning"));
  });
});

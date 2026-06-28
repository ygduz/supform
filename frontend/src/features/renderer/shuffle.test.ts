import type { FormSchema } from "@/types/form-schema";
import { describe, expect, it } from "vitest";
import { shuffleForDisplay } from "./shuffle";

const base = (settings: Record<string, unknown>): FormSchema => ({
  schemaVersion: "1.0",
  name: "f",
  title: "F",
  settings,
  pages: [
    {
      name: "p1",
      elements: [
        { type: "text", name: "q1" },
        { type: "text", name: "q2" },
        { type: "text", name: "q3" },
        {
          type: "single_choice",
          name: "q4",
          options: [{ value: "a" }, { value: "b" }, { value: "c" }, { value: "d" }],
        },
      ],
    },
  ],
});

const names = (s: FormSchema) => s.pages[0].elements.map((e) => e.name);
const optValues = (s: FormSchema) =>
  (s.pages[0].elements.find((e) => e.name === "q4")?.options ?? []).map((o) => o.value);

describe("shuffleForDisplay", () => {
  it("returns the original schema when neither shuffle is enabled", () => {
    const s = base({});
    expect(shuffleForDisplay(s, 123)).toBe(s);
  });

  it("is stable for a given seed and preserves the full set of questions", () => {
    const s = base({ shuffleQuestions: true });
    const a = shuffleForDisplay(s, 42);
    const b = shuffleForDisplay(s, 42);
    expect(names(a)).toEqual(names(b)); // same seed → same order
    expect([...names(a)].sort()).toEqual(["q1", "q2", "q3", "q4"]); // nothing lost
  });

  it("shuffles options without dropping any", () => {
    const s = base({ shuffleOptions: true });
    const a = shuffleForDisplay(s, 7);
    expect([...optValues(a)].sort()).toEqual(["a", "b", "c", "d"]);
    // question order untouched when only options shuffle
    expect(names(a)).toEqual(["q1", "q2", "q3", "q4"]);
  });

  it("does not mutate the input schema", () => {
    const s = base({ shuffleQuestions: true, shuffleOptions: true });
    const before = names(s);
    shuffleForDisplay(s, 99);
    expect(names(s)).toEqual(before);
  });
});

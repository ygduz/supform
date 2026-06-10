import type { Element, FormSchema } from "@/types/form-schema";
import { describe, expect, it } from "vitest";
import { buildColumns, buildSummaries } from "./columns";

function form(elements: Element[]): FormSchema {
  return { name: "f", title: "F", pages: [{ name: "p1", elements }] } as FormSchema;
}

describe("buildColumns", () => {
  it("skips notes, flattens groups, and expands a matrix per row", () => {
    const schema = form([
      { type: "note", name: "intro", label: "Hi" },
      { type: "text", name: "full_name", label: "Name" },
      {
        type: "group",
        name: "addr",
        elements: [{ type: "text", name: "city", label: "City" }],
      },
      {
        type: "matrix",
        name: "rate",
        label: "Rate",
        rows: [
          { value: "speed", label: "Speed" },
          { value: "ease", label: "Ease" },
        ],
        columns: [{ value: "low" }, { value: "high" }],
      },
    ]);
    const keys = buildColumns(schema).map((c) => c.key);
    expect(keys).toEqual(["full_name", "city", "rate/speed", "rate/ease"]);
  });

  it("joins multi_choice and formats booleans / matrix cells", () => {
    const schema = form([
      { type: "multi_choice", name: "langs", options: [{ value: "py" }, { value: "go" }] },
      { type: "boolean", name: "agree" },
      {
        type: "matrix",
        name: "rate",
        rows: [{ value: "speed" }],
        columns: [{ value: "high" }],
      },
    ]);
    const cols = buildColumns(schema);
    const answers = { langs: ["py", "go"], agree: true, rate: { speed: "high" } };
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c.value(answers)]));
    expect(byKey.langs).toBe("py; go");
    expect(byKey.agree).toBe("Yes");
    expect(byKey["rate/speed"]).toBe("high");
  });
});

describe("buildSummaries", () => {
  it("counts choice-field values across rows, resolving option labels", () => {
    const schema = form([
      {
        type: "single_choice",
        name: "color",
        label: "Color",
        options: [
          { value: "r", label: "Red" },
          { value: "b", label: "Blue" },
        ],
      },
      { type: "text", name: "note" },
    ]);
    const rows = [
      { answers: { color: "r" } },
      { answers: { color: "r" } },
      { answers: { color: "b" } },
    ];
    const summaries = buildSummaries(schema, rows);
    expect(summaries).toHaveLength(1); // text field is not summarized
    expect(summaries[0].name).toBe("color");
    expect(summaries[0].counts).toEqual([
      { label: "Red", count: 2 },
      { label: "Blue", count: 1 },
    ]);
  });
});

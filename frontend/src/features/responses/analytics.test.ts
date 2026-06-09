import type { FormSchema } from "@/types/form-schema";
import { describe, expect, it } from "vitest";
import { numericStats, responsesByDay } from "./analytics";

function schema(): FormSchema {
  return {
    schemaVersion: "1.0",
    name: "survey",
    title: "Survey",
    pages: [
      {
        name: "p1",
        elements: [
          { type: "integer", name: "age", label: "Age" },
          { type: "rating", name: "stars", label: "Rating" },
          { type: "text", name: "comment", label: "Comment" },
        ],
      },
    ],
  };
}

describe("numericStats", () => {
  it("computes count/min/max/mean/median for numeric fields", () => {
    const rows = [
      { answers: { age: 20, stars: 5 } },
      { answers: { age: 30, stars: 3 } },
      { answers: { age: 40 } },
      { answers: { comment: "ignored" } },
    ];
    const stats = numericStats(schema(), rows);
    const age = stats.find((s) => s.name === "age");
    expect(age).toMatchObject({ count: 3, min: 20, max: 40, mean: 30, median: 30 });
    // Free-text fields produce no stats.
    expect(stats.find((s) => s.name === "comment")).toBeUndefined();
  });

  it("coerces numeric strings and ignores blanks", () => {
    const rows = [{ answers: { age: "10" } }, { answers: { age: "" } }, { answers: { age: 20 } }];
    const age = numericStats(schema(), rows).find((s) => s.name === "age");
    expect(age).toMatchObject({ count: 2, min: 10, max: 20, mean: 15 });
  });

  it("takes the median of an even-sized set as the midpoint average", () => {
    const rows = [
      { answers: { age: 10 } },
      { answers: { age: 20 } },
      { answers: { age: 30 } },
      { answers: { age: 40 } },
    ];
    const age = numericStats(schema(), rows).find((s) => s.name === "age");
    expect(age?.median).toBe(25);
  });
});

describe("responsesByDay", () => {
  it("groups by calendar day and fills empty days in the range", () => {
    // Local-time stamps (no Z) keep day grouping deterministic across runner timezones.
    const series = responsesByDay([
      { created_at: "2026-06-01T09:00:00" },
      { created_at: "2026-06-01T18:00:00" },
      { created_at: "2026-06-03T12:00:00" },
    ]);
    expect(series.map((d) => d.count)).toEqual([2, 0, 1]);
    expect(series[0].date <= series[2].date).toBe(true);
  });

  it("returns an empty series for no responses", () => {
    expect(responsesByDay([])).toEqual([]);
  });
});

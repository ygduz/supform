/**
 * Analytics computations over a form's submissions: numeric field statistics and a
 * responses-over-time series. Choice-field distributions reuse `buildSummaries`.
 *
 * Pure functions (no React) so they're easy to unit-test and reuse.
 */
import { localize } from "@/lib/i18n";
import type { Element, FormSchema } from "@/types/form-schema";

const elementLabel = (el: Element): string => localize(el.label) || el.name;
const NUMERIC_TYPES = new Set(["number", "integer", "decimal", "rating", "scale"]);

export interface NumericStat {
  name: string;
  label: string;
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Per numeric/rating/scale field: count, min, max, mean, median across responses. */
export function numericStats(
  schema: FormSchema,
  rows: Array<{ answers: Record<string, unknown> }>,
): NumericStat[] {
  const stats: NumericStat[] = [];

  const walk = (elements: Element[]) => {
    for (const el of elements) {
      if (el.type === "group") {
        walk(el.elements ?? []);
        continue;
      }
      if (!NUMERIC_TYPES.has(el.type)) continue;

      const values: number[] = [];
      for (const row of rows) {
        const n = toNumber(row.answers[el.name]);
        if (n !== null) values.push(n);
      }
      if (values.length === 0) continue;

      values.sort((a, b) => a - b);
      const sum = values.reduce((acc, v) => acc + v, 0);
      stats.push({
        name: el.name,
        label: elementLabel(el),
        count: values.length,
        min: values[0],
        max: values[values.length - 1],
        mean: sum / values.length,
        median: median(values),
      });
    }
  };

  walk(schema.pages.flatMap((p) => p.elements));
  return stats;
}

export interface DayCount {
  date: string; // YYYY-MM-DD
  count: number;
}

/** Submissions grouped by calendar day (local time), ascending, with empty days filled. */
export function responsesByDay(rows: Array<{ created_at: string }>): DayCount[] {
  if (rows.length === 0) return [];

  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(new Date(row.created_at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const keys = [...counts.keys()].sort();
  const start = new Date(`${keys[0]}T00:00:00`);
  const end = new Date(`${keys[keys.length - 1]}T00:00:00`);

  const series: DayCount[] = [];
  // Cap the filled range so a single old + new response can't produce a huge array.
  for (let d = start, guard = 0; d <= end && guard < 366; d.setDate(d.getDate() + 1), guard++) {
    const key = dayKey(d);
    series.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return series;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

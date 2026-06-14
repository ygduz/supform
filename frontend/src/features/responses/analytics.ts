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

const TEXT_TYPES = new Set(["text", "longtext", "email", "url", "phone"]);

// Common English words filtered out of the word-frequency cloud so it surfaces signal.
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "any",
  "can",
  "her",
  "was",
  "one",
  "our",
  "out",
  "his",
  "has",
  "had",
  "him",
  "she",
  "its",
  "who",
  "did",
  "yes",
  "this",
  "that",
  "with",
  "have",
  "from",
  "they",
  "will",
  "your",
  "would",
  "there",
  "their",
  "what",
  "about",
  "which",
  "when",
  "make",
  "like",
  "time",
  "just",
  "them",
  "than",
  "then",
  "some",
  "very",
  "into",
  "more",
  "also",
  "been",
  "were",
  "being",
  "could",
  "should",
  "really",
  "much",
]);

export interface TextResponses {
  name: string;
  label: string;
  /** Number of non-empty text answers. */
  count: number;
  /** The raw answers, most recent first, for reading. */
  answers: string[];
  /** Most frequent meaningful words across all answers. */
  topWords: Array<{ word: string; count: number }>;
}

/** Per free-text field: the answers themselves plus a top-words frequency. */
export function textResponses(
  schema: FormSchema,
  rows: Array<{ answers: Record<string, unknown> }>,
): TextResponses[] {
  const out: TextResponses[] = [];

  const walk = (elements: Element[]) => {
    for (const el of elements) {
      if (el.type === "group") {
        walk(el.elements ?? []);
        continue;
      }
      if (!TEXT_TYPES.has(el.type)) continue;

      const answers: string[] = [];
      const words = new Map<string, number>();
      // Walk rows newest-last (as stored); collect non-empty strings and tally words.
      for (const row of rows) {
        const value = row.answers[el.name];
        if (typeof value !== "string" || value.trim() === "") continue;
        answers.push(value.trim());
        for (const w of value.toLowerCase().match(/[a-z][a-z']{2,}/g) ?? []) {
          if (STOP_WORDS.has(w)) continue;
          words.set(w, (words.get(w) ?? 0) + 1);
        }
      }
      if (answers.length === 0) continue;

      const topWords = [...words.entries()]
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
        .slice(0, 12);

      out.push({
        name: el.name,
        label: elementLabel(el),
        count: answers.length,
        answers: answers.reverse(), // most recent first
        topWords,
      });
    }
  };

  walk(schema.pages.flatMap((p) => p.elements));
  return out;
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

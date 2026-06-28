/**
 * Analytics computations over a form's submissions: numeric field statistics and a
 * responses-over-time series. Choice-field distributions reuse `buildSummaries`.
 *
 * Pure functions (no React) so they're easy to unit-test and reuse.
 */
import type { GradingResult } from "@/api/client";
import { isNumericType } from "@/lib/fieldTypes";
import { localize } from "@/lib/i18n";
import type { Element, FormSchema } from "@/types/form-schema";

const elementLabel = (el: Element): string => localize(el.label) || el.name;

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
      if (!isNumericType(el.type)) continue;

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

export interface SummaryStats {
  total: number;
  last7Days: number;
  flaggedCount: number;
  flagRate: number; // 0–100
  flagBreakdown: Array<{ flag: string; count: number; pct: number }>;
}

/** Top-level counts and quality flag breakdown for the summary card. */
export function summaryStats(
  rows: Array<{ created_at: string; quality_flags: string[] }>,
): SummaryStats {
  const now = Date.now();
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  let last7Days = 0;
  const flagCounts = new Map<string, number>();

  for (const row of rows) {
    if (new Date(row.created_at).getTime() >= cutoff) last7Days++;
    for (const f of row.quality_flags) flagCounts.set(f, (flagCounts.get(f) ?? 0) + 1);
  }

  const total = rows.length;
  const flaggedCount = rows.filter((r) => r.quality_flags.length > 0).length;
  const flagRate = total > 0 ? Math.round((flaggedCount / total) * 100) : 0;
  const flagBreakdown = [...flagCounts.entries()]
    .map(([flag, count]) => ({
      flag,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { total, last7Days, flaggedCount, flagRate, flagBreakdown };
}

export interface CompletionTimeStat {
  count: number;
  mean: number; // seconds
  median: number;
  min: number;
  max: number;
}

/** Completion time statistics derived from the client-sent _started_at timestamp. */
export function completionTimeStats(
  rows: Array<{ created_at: string; started_at?: string }>,
): CompletionTimeStat | null {
  const durations: number[] = [];
  for (const row of rows) {
    if (!row.started_at) continue;
    try {
      const start = new Date(row.started_at).getTime();
      const end = new Date(row.created_at).getTime();
      const secs = (end - start) / 1000;
      // Discard nonsensical values (negative or absurdly long > 4 hours)
      if (secs > 0 && secs < 14400) durations.push(secs);
    } catch {
      /* skip */
    }
  }
  if (durations.length === 0) return null;
  durations.sort((a, b) => a - b);
  const sum = durations.reduce((a, b) => a + b, 0);
  const mid = Math.floor(durations.length / 2);
  return {
    count: durations.length,
    mean: sum / durations.length,
    median: durations.length % 2 === 0 ? (durations[mid - 1] + durations[mid]) / 2 : durations[mid],
    min: durations[0],
    max: durations[durations.length - 1],
  };
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── quiz scores ──────────────────────────────────────────────────────────────────

/** A submission as seen by the score analytics (quiz fields are optional on the wire). */
interface ScoredRow {
  answers: Record<string, unknown>;
  score?: number | null;
  grading?: GradingResult | null;
}

export interface ScoreStats {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  maxPossible: number | null;
  histogram: Array<{ label: string; count: number }>;
  outcomes: Array<{ label: string; count: number }>;
}

/** The earned score for one row: graded earned-points when available, else additive score. */
function rowScore(row: ScoredRow): number | null {
  if (row.grading && row.grading.gradedCount > 0) return row.grading.earnedPoints;
  if (typeof row.score === "number") return row.score;
  return null;
}

/** Total achievable points across all graded questions in the form (0 if none are graded). */
function schemaMaxPoints(schema: FormSchema): number {
  let total = 0;
  const walk = (els: Element[]) => {
    for (const el of els) {
      const graded =
        (el.correctAnswer !== undefined && el.correctAnswer !== null) ||
        (el.options ?? []).some((o) => o.correct === true);
      if (graded) total += typeof el.points === "number" ? el.points : 1;
      if (el.elements) walk(el.elements);
    }
  };
  for (const p of schema.pages) walk(p.elements);
  return total;
}

/**
 * Aggregate quiz scores across responses: distribution, average, and pass-rate by outcome band.
 * Returns null when the form isn't a quiz or no response carries a score.
 */
export function scoreStats(schema: FormSchema, rows: ScoredRow[]): ScoreStats | null {
  if (!schema.settings?.quizMode) return null;
  const scores: number[] = [];
  for (const row of rows) {
    const s = rowScore(row);
    if (s !== null) scores.push(s);
  }
  if (scores.length === 0) return null;
  // The denominator is the full quiz total from the schema — NOT any single respondent's
  // maxPoints, which varies because unanswered graded questions aren't counted per-response.
  const maxPossible: number | null = schemaMaxPoints(schema) || null;

  const sorted = [...scores].sort((a, b) => a - b);
  const sum = scores.reduce((a, b) => a + b, 0);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Histogram: percentage bands when the max is known, else integer-score buckets.
  const histogram: Array<{ label: string; count: number }> = [];
  if (maxPossible && maxPossible > 0) {
    const bands = [
      { label: "0–20%", lo: 0, hi: 0.2 },
      { label: "20–40%", lo: 0.2, hi: 0.4 },
      { label: "40–60%", lo: 0.4, hi: 0.6 },
      { label: "60–80%", lo: 0.6, hi: 0.8 },
      { label: "80–100%", lo: 0.8, hi: 1.0001 },
    ];
    for (const b of bands) {
      const count = scores.filter((s) => {
        const pct = s / maxPossible;
        return pct >= b.lo && pct < b.hi;
      }).length;
      histogram.push({ label: b.label, count });
    }
  } else {
    const buckets = new Map<number, number>();
    for (const s of scores) buckets.set(s, (buckets.get(s) ?? 0) + 1);
    for (const key of [...buckets.keys()].sort((a, b) => a - b)) {
      histogram.push({ label: String(key), count: buckets.get(key) ?? 0 });
    }
  }

  // Pass-rate by outcome band (uses the same [min,max] bands the renderer matches on).
  const outcomes = (schema.settings.outcomes ?? []).map((o) => ({
    label: localize(o.message) || `${o.min}–${o.max}`,
    count: scores.filter((s) => s >= o.min && s <= o.max).length,
  }));

  return {
    count: scores.length,
    mean: sum / scores.length,
    median: median(sorted),
    min,
    max,
    maxPossible,
    histogram,
    outcomes,
  };
}

export interface QuestionCorrectRate {
  name: string;
  label: string;
  correct: number;
  total: number;
  rate: number; // 0–100
}

/** Per graded question: how many responses got it right (of those that answered it). */
export function perQuestionCorrectRate(
  schema: FormSchema,
  rows: ScoredRow[],
): QuestionCorrectRate[] {
  if (!schema.settings?.quizMode) return [];
  // Graded element names + labels, in schema order.
  const graded: Array<{ name: string; label: string }> = [];
  const seen = new Set<string>();
  const walk = (els: Element[]) => {
    for (const el of els) {
      const isGraded =
        (el.correctAnswer !== undefined && el.correctAnswer !== null) ||
        (el.options ?? []).some((o) => o.correct === true);
      if (isGraded && !seen.has(el.name)) {
        seen.add(el.name);
        graded.push({ name: el.name, label: elementLabel(el) });
      }
      if (el.elements) walk(el.elements);
    }
  };
  for (const p of schema.pages) walk(p.elements);

  return graded.map(({ name, label }) => {
    let correct = 0;
    let total = 0;
    for (const row of rows) {
      const fg = row.grading?.perField?.[name];
      if (!fg) continue;
      total++;
      if (fg.correct) correct++;
    }
    return {
      name,
      label,
      correct,
      total,
      rate: total > 0 ? Math.round((correct / total) * 100) : 0,
    };
  });
}

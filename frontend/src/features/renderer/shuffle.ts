/**
 * Display-only randomization for the renderer: question order and/or choice-option order,
 * controlled by `settings.shuffleQuestions` / `settings.shuffleOptions`.
 *
 * Shuffling is seeded so it stays stable across re-renders within a single fill-in session
 * (re-shuffling on every keystroke would be disorienting), and it only reorders presentation —
 * answers are keyed by element/option *value*, so storage, validation, and grading are unaffected.
 */

import type { Element, FormSchema, Page } from "@/types/form-schema";

/** Small deterministic PRNG (mulberry32) so a seed yields a stable order. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleOptionsDeep(el: Element, rand: () => number): Element {
  let next = el;
  if (el.options && el.options.length > 1) {
    next = { ...next, options: shuffled(el.options, rand) };
  }
  if (el.elements) {
    next = { ...next, elements: el.elements.map((c) => shuffleOptionsDeep(c, rand)) };
  }
  return next;
}

/**
 * Return a presentation copy of the schema with questions and/or options reordered per the
 * form's settings. Returns the original schema unchanged when neither shuffle is enabled.
 */
export function shuffleForDisplay(schema: FormSchema, seed: number): FormSchema {
  const s = schema.settings;
  if (!s?.shuffleQuestions && !s?.shuffleOptions) return schema;
  const rand = mulberry32(seed || 1);
  const pages: Page[] = schema.pages.map((p) => {
    let els = p.elements;
    if (s.shuffleOptions) els = els.map((el) => shuffleOptionsDeep(el, rand));
    if (s.shuffleQuestions) els = shuffled(els, rand);
    return { ...p, elements: els };
  });
  return { ...schema, pages };
}

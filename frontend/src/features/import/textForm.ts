import { localize } from "@/lib/i18n";
import type { Choice, Element, ElementType, FormSchema } from "@/types/form-schema";

/**
 * Plain-text / Word form authoring format.
 *
 *   # My form title            (optional, first heading)
 *   * Section title            (a section — following questions nest inside)
 *   - Question text (type) *   (a question; (type) and trailing * = required are optional)
 *   > Help text                (optional hint for the question just above)
 *     • Choice one             (a choice for the question just above)
 *     • Choice two
 *
 * Markers: `*` section, `-` question, `•` choice, `>` help text, `#` form title.
 * The leading whitespace is ignored, so authors can indent choices for readability.
 */

const TYPE_ALIASES: Record<string, ElementType> = {
  // words
  text: "text",
  short: "text",
  long: "longtext",
  longtext: "longtext",
  paragraph: "longtext",
  email: "email",
  url: "url",
  phone: "phone",
  number: "number",
  integer: "integer",
  decimal: "decimal",
  date: "date",
  time: "time",
  single: "single_choice",
  choice: "single_choice",
  radio: "single_choice",
  multi: "multi_choice",
  multiple: "multi_choice",
  checkbox: "multi_choice",
  checkboxes: "multi_choice",
  dropdown: "dropdown",
  select: "dropdown",
  rating: "rating",
  scale: "scale",
  yesno: "boolean",
  yn: "boolean",
  boolean: "boolean",
  // single-character codes (mnemonic) — usable as e.g. (@) or (e)
  t: "text",
  p: "longtext",
  "=": "longtext",
  e: "email",
  "@": "email",
  u: "url",
  n: "number",
  "#": "number",
  d: "date",
  c: "single_choice",
  m: "multi_choice",
  l: "dropdown",
  r: "rating",
  s: "scale",
  y: "boolean",
};

const CHOICE_BULLETS = ["•", "·", "‣", "◦", "▪"];

/** Question types that hold a `•` choice list. */
const CHOICE_TYPES = new Set<ElementType>(["single_choice", "multi_choice", "dropdown"]);

/** Stable, unique, snake_case field key from a label. */
function slugify(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field";
  let name = base;
  let i = 2;
  while (taken.has(name)) name = `${base}_${i++}`;
  taken.add(name);
  return name;
}

/**
 * Best-effort type guess from a question's wording, used only when the author gave no
 * explicit `(type)` and no choices. Conservative — leaves it as text when unsure.
 */
const SNIFF_RULES: { type: ElementType; re: RegExp }[] = [
  { type: "email", re: /\be-?mail\b/i },
  { type: "phone", re: /\b(phone|mobile|telephone|cell|whatsapp)\b/i },
  { type: "url", re: /\b(url|website|web site|link|homepage)\b/i },
  { type: "date", re: /\b(date|birthday|birth date|dob|deadline|arrival|departure)\b/i },
  {
    type: "number",
    re: /\b(age|how many|how much|number of|quantity|qty|amount|count|price|cost|budget|year|salary|weight|height)\b/i,
  },
  {
    type: "longtext",
    re: /\b(describe|description|explain|comment|comments|details|feedback|message|why|reason|tell us|elaborate|notes?)\b/i,
  },
];

function sniffType(label: string): ElementType | null {
  for (const { type, re } of SNIFF_RULES) {
    if (re.test(label)) return type;
  }
  return null;
}

interface ParsedQuestion {
  el: Element;
  /** Explicit type from `(type)`, so a trailing choice list can't override it wrongly. */
  explicitType: boolean;
}

/** Split a question line into its label, optional `(type)`, and trailing `*` required flag. */
function parseQuestionLine(rest: string): {
  label: string;
  type: ElementType | null;
  required: boolean;
} {
  let text = rest.trim();
  let required = false;
  if (text.endsWith("*")) {
    required = true;
    text = text.slice(0, -1).trim();
  }
  let type: ElementType | null = null;
  const typeMatch = text.match(/\(([^)]+)\)\s*$/);
  if (typeMatch) {
    const alias = typeMatch[1].trim().toLowerCase();
    if (TYPE_ALIASES[alias]) {
      type = TYPE_ALIASES[alias];
      text = text.slice(0, typeMatch.index).trim();
    }
  }
  return { label: text, type, required };
}

function lineKind(line: string): {
  kind: "title" | "section" | "question" | "hint" | "choice" | "blank";
  rest: string;
} {
  const t = line.trim();
  if (t === "") return { kind: "blank", rest: "" };
  if (t.startsWith("#")) return { kind: "title", rest: t.replace(/^#+/, "").trim() };
  if (t.startsWith("*")) return { kind: "section", rest: t.slice(1).trim() };
  if (CHOICE_BULLETS.some((b) => t.startsWith(b)))
    return { kind: "choice", rest: t.slice(1).trim() };
  if (t.startsWith(">")) return { kind: "hint", rest: t.slice(1).trim() };
  if (t.startsWith("-")) return { kind: "question", rest: t.slice(1).trim() };
  return { kind: "blank", rest: "" };
}

export interface ParseOptions {
  /** Title to use when the text declares none. */
  fallbackTitle?: string;
  /**
   * Guess a question's type from its wording when no explicit type/choices are given.
   * Off by default: it's English-keyword based, so the deterministic, language-neutral
   * character codes are the primary way to set types. Opt in for convenience.
   */
  sniff?: boolean;
}

/**
 * Parse the marker-based text format into a FormSchema. Always returns a usable schema
 * (an empty one if nothing parsed) so the caller can open it in the builder directly.
 */
export function parseTextForm(text: string, opts: ParseOptions = {}): FormSchema {
  const { fallbackTitle = "Imported form", sniff = false } = opts;
  const taken = new Set<string>();
  const topLevel: Element[] = [];
  let currentSection: Element | null = null;
  let current: ParsedQuestion | null = null;
  let title = "";

  const addElement = (el: Element) => {
    if (currentSection) {
      currentSection.elements = [...(currentSection.elements ?? []), el];
    } else {
      topLevel.push(el);
    }
  };

  for (const raw of text.split(/\r?\n/)) {
    const { kind, rest } = lineKind(raw);
    if (kind === "blank") continue;

    if (kind === "title") {
      if (!title) title = rest;
      continue;
    }

    if (kind === "section") {
      current = null;
      currentSection = {
        type: "group",
        name: slugify(rest || "section", taken),
        label: rest || "Section",
        elements: [],
      };
      topLevel.push(currentSection);
      continue;
    }

    if (kind === "question") {
      const { label, type, required } = parseQuestionLine(rest);
      // Fall back to a wording-based guess only when opted in; a later choice list can
      // still override a (non-explicit) guess by promoting to single_choice.
      const resolved = type ?? (sniff ? sniffType(label) : null);
      const el: Element = {
        type: resolved ?? "text",
        name: slugify(label, taken),
        label: label || "Untitled question",
      };
      if (required) el.required = true;
      if (resolved && CHOICE_TYPES.has(resolved)) el.options = [];
      addElement(el);
      current = { el, explicitType: type !== null };
      continue;
    }

    if (kind === "hint" && current) {
      current.el.hint = rest;
      continue;
    }

    if (kind === "choice" && current) {
      // First choice on a plain question promotes it to single-choice.
      if (!CHOICE_TYPES.has(current.el.type)) {
        if (current.explicitType) continue; // explicit non-choice type: ignore stray bullet
        current.el.type = "single_choice";
        current.el.options = [];
      }
      const choice: Choice = { value: slugify(rest, new Set()), label: rest };
      current.el.options = [...(current.el.options ?? []), choice];
    }
  }

  const pages = [{ name: "page1", elements: topLevel }];
  return {
    schemaVersion: "1.0",
    name: slugify(title || fallbackTitle, new Set()),
    title: title || fallbackTitle,
    pages,
  };
}

/** The `(type)` word to emit on export, or "" when the type needs no annotation. */
const TYPE_WORD: Partial<Record<ElementType, string>> = {
  longtext: "paragraph",
  email: "email",
  url: "url",
  phone: "phone",
  number: "number",
  integer: "integer",
  decimal: "decimal",
  date: "date",
  time: "time",
  multi_choice: "multi",
  dropdown: "dropdown",
  rating: "rating",
  scale: "scale",
  boolean: "yesno",
};

/**
 * Serialize a form back to the marker text format — the inverse of parseTextForm, so a
 * form can be round-tripped through Word/text. `text` and `single_choice` need no `(type)`
 * (a bullet list implies single choice); `group`/`repeat` become `*` sections.
 */
export function formToText(schema: FormSchema): string {
  const out: string[] = [];
  const title = localize(schema.title);
  if (title) out.push(`# ${title}`, "");

  const writeQuestion = (el: Element, indent: string) => {
    const word = TYPE_WORD[el.type];
    const typeSuffix = word ? ` (${word})` : "";
    const req = el.required ? " *" : "";
    out.push(`${indent}- ${localize(el.label) || el.name}${typeSuffix}${req}`);
    const hint = localize(el.hint);
    if (hint) out.push(`${indent}  > ${hint}`);
    for (const opt of el.options ?? []) {
      out.push(`${indent}  • ${localize(opt.label) || String(opt.value)}`);
    }
  };

  const walk = (els: Element[], topLevel: boolean) => {
    for (const el of els) {
      if (el.type === "group" || el.type === "repeat") {
        out.push("", `* ${localize(el.label) || el.name}`);
        walk(el.elements ?? [], false);
      } else {
        writeQuestion(el, topLevel ? "" : "  ");
      }
    }
  };

  for (const page of schema.pages) walk(page.elements, true);
  return `${out.join("\n").trim()}\n`;
}

/** Count questions/sections so the UI can preview what an import will produce. */
export function summarize(schema: FormSchema): { sections: number; questions: number } {
  let sections = 0;
  let questions = 0;
  const walk = (els: Element[]) => {
    for (const el of els) {
      if (el.type === "group" || el.type === "repeat") {
        sections++;
        walk(el.elements ?? []);
      } else {
        questions++;
      }
    }
  };
  for (const p of schema.pages) walk(p.elements);
  return { sections, questions };
}

/**
 * Pure helpers for manipulating a FormSchema in the builder.
 *
 * Kept free of React/Zustand so the editing logic is trivially unit-testable and the
 * store/components stay thin. All functions are immutable: they return a new schema.
 *
 * Element identity is the stable `name` (the key used in submission data and logic).
 * Names are auto-managed; users edit `label`, never `name`.
 */
import type { Choice, Element, ElementType, FormSchema } from "@/types/form-schema";

export const DEFAULT_LABELS: Partial<Record<ElementType, string>> = {
  text: "Short text question",
  longtext: "Long answer question",
  single_choice: "Single choice question",
  multi_choice: "Multiple choice question",
  dropdown: "Dropdown question",
  rating: "Rating question",
  number: "Number question",
  date: "Date question",
  file: "File upload",
};

const CHOICE_TYPES: ReadonlySet<string> = new Set([
  "single_choice",
  "multi_choice",
  "dropdown",
  "ranking",
]);

export function isChoiceType(type: ElementType): boolean {
  return CHOICE_TYPES.has(type);
}

export function createEmptyForm(): FormSchema {
  return {
    schemaVersion: "1.0",
    name: "untitled_form",
    title: "Untitled form",
    pages: [{ name: "page1", elements: [] }],
  };
}

/** All elements on the (single) builder page. */
export function elementsOf(schema: FormSchema): Element[] {
  return schema.pages[0]?.elements ?? [];
}

/** Generate a name unique within the form, e.g. q1, q2, ... */
function nextName(schema: FormSchema): string {
  const taken = new Set(elementsOf(schema).map((e) => e.name));
  let i = elementsOf(schema).length + 1;
  while (taken.has(`q${i}`)) i += 1;
  return `q${i}`;
}

function withElements(schema: FormSchema, elements: Element[]): FormSchema {
  const pages = schema.pages.map((p, i) => (i === 0 ? { ...p, elements } : p));
  return { ...schema, pages };
}

function mapElement(schema: FormSchema, name: string, fn: (el: Element) => Element): FormSchema {
  return withElements(
    schema,
    elementsOf(schema).map((el) => (el.name === name ? fn(el) : el)),
  );
}

export function addElement(
  schema: FormSchema,
  type: ElementType,
): { schema: FormSchema; name: string } {
  const name = nextName(schema);
  const el: Element = { type, name, label: DEFAULT_LABELS[type] ?? "Question" };
  if (isChoiceType(type) || type === "rating") {
    el.options = [
      { value: "option_1", label: "Option 1" },
      { value: "option_2", label: "Option 2" },
    ];
  }
  return { schema: withElements(schema, [...elementsOf(schema), el]), name };
}

export function updateElement(
  schema: FormSchema,
  name: string,
  patch: Partial<Element>,
): FormSchema {
  return mapElement(schema, name, (el) => ({ ...el, ...patch }));
}

export function removeElement(schema: FormSchema, name: string): FormSchema {
  return withElements(
    schema,
    elementsOf(schema).filter((el) => el.name !== name),
  );
}

export function duplicateElement(
  schema: FormSchema,
  name: string,
): { schema: FormSchema; name: string } {
  const els = elementsOf(schema);
  const idx = els.findIndex((e) => e.name === name);
  if (idx === -1) return { schema, name };
  const copyName = nextName(schema);
  const copy: Element = { ...structuredClone(els[idx]), name: copyName };
  const next = [...els.slice(0, idx + 1), copy, ...els.slice(idx + 1)];
  return { schema: withElements(schema, next), name: copyName };
}

/** Move an element to a new index (clamped). Used by reordering (drag or buttons). */
export function moveElement(schema: FormSchema, name: string, toIndex: number): FormSchema {
  const els = [...elementsOf(schema)];
  const from = els.findIndex((e) => e.name === name);
  if (from === -1) return schema;
  const clamped = Math.max(0, Math.min(toIndex, els.length - 1));
  const [moved] = els.splice(from, 1);
  els.splice(clamped, 0, moved);
  return withElements(schema, els);
}

export function moveBy(schema: FormSchema, name: string, delta: number): FormSchema {
  const from = elementsOf(schema).findIndex((e) => e.name === name);
  if (from === -1) return schema;
  return moveElement(schema, name, from + delta);
}

// ---- choice option editing ----
export function addOption(schema: FormSchema, name: string): FormSchema {
  return mapElement(schema, name, (el) => {
    const options = el.options ?? [];
    const n = options.length + 1;
    return { ...el, options: [...options, { value: `option_${n}`, label: `Option ${n}` }] };
  });
}

export function updateOption(
  schema: FormSchema,
  name: string,
  index: number,
  patch: Partial<Choice>,
): FormSchema {
  return mapElement(schema, name, (el) => {
    const options = (el.options ?? []).map((opt, i) => (i === index ? { ...opt, ...patch } : opt));
    return { ...el, options };
  });
}

export function removeOption(schema: FormSchema, name: string, index: number): FormSchema {
  return mapElement(schema, name, (el) => ({
    ...el,
    options: (el.options ?? []).filter((_, i) => i !== index),
  }));
}

/**
 * Pure helpers for manipulating a FormSchema in the builder.
 *
 * Kept free of React/Zustand so the editing logic is trivially unit-testable and the
 * store/components stay thin. All functions are immutable: they return a new schema.
 *
 * The form is a tree: pages -> elements, and container elements (group, repeat) nest
 * further elements. Operations address an element by its stable, form-unique `name` and
 * recurse through the whole tree, so they work the same at the top level or inside a
 * group/repeat. Users edit `label`; `name` is auto-managed.
 */
import type {
  Choice,
  Element,
  ElementType,
  FormSchema,
  I18nString,
  Page,
} from "@/types/form-schema";
import { defaultLabelFor } from "./fieldMeta";

const CHOICE_TYPES: ReadonlySet<string> = new Set([
  "single_choice",
  "multi_choice",
  "dropdown",
  "ranking",
]);

const CONTAINER_TYPES: ReadonlySet<string> = new Set(["group", "repeat"]);

/** Display-only types that collect no answer value (info text, raw HTML). */
const PRESENTATIONAL_TYPES: ReadonlySet<string> = new Set(["note", "section", "html"]);

/**
 * Types whose answer value is a number (or ordered scale that maps to a number).
 * NOTE: `calculated` is intentionally excluded here — it IS numeric for formula operands
 * (FormulaBuilder adds it locally) but is NOT user-answerable, so it doesn't belong in
 * the shared set that drives operator selection and analytics.
 */
const NUMERIC_TYPES: ReadonlySet<string> = new Set([
  "number",
  "integer",
  "decimal",
  "rating",
  "scale",
]);

export function isChoiceType(type: ElementType): boolean {
  return CHOICE_TYPES.has(type);
}

export function isContainerType(type: ElementType): boolean {
  return CONTAINER_TYPES.has(type);
}

/** Display-only types (note / html) that never carry a respondent answer. */
export function isPresentationalType(type: ElementType): boolean {
  return PRESENTATIONAL_TYPES.has(type);
}

/** Types with no answer value of their own: presentational text and containers. */
export function isNoValueType(type: ElementType): boolean {
  return isPresentationalType(type) || isContainerType(type);
}

/** Types whose answer value is numeric. See NUMERIC_TYPES comment for what is excluded. */
export function isNumericType(type: ElementType): boolean {
  return NUMERIC_TYPES.has(type);
}

/** Types that carry an editable list of choice `options`. */
export function hasOptionList(type: ElementType): boolean {
  return isChoiceType(type) || type === "rating" || type === "scale";
}

/**
 * Confirm before deleting a section that still holds questions (they go with it).
 * Returns true when the deletion should proceed.
 */
export function confirmDeleteContainer(type: ElementType, childCount: number): boolean {
  if (!isContainerType(type) || childCount === 0) return true;
  return window.confirm(
    `Delete this section and the ${childCount} ${
      childCount === 1 ? "question" : "questions"
    } inside it?\n\nTip: use Ungroup (⊟) to keep the questions.`,
  );
}

export function createEmptyForm(): FormSchema {
  return {
    schemaVersion: "1.0",
    name: "untitled_form",
    title: "Untitled form",
    pages: [{ name: "page1", elements: [] }],
  };
}

/** Elements on a given page (top level only). */
export function pageElements(schema: FormSchema, pageIndex: number): Element[] {
  return schema.pages[pageIndex]?.elements ?? [];
}

/** Every element in the form, flattened across pages and containers. */
export function allElements(schema: FormSchema): Element[] {
  const out: Element[] = [];
  const walk = (els: Element[]) => {
    for (const el of els) {
      out.push(el);
      if (el.elements) walk(el.elements);
    }
  };
  for (const page of schema.pages) walk(page.elements);
  return out;
}

export function findElement(schema: FormSchema, name: string): Element | null {
  return allElements(schema).find((el) => el.name === name) ?? null;
}

// ---------------------------------------------------------------- tree internals
function freshName(taken: Set<string>): string {
  let i = 1;
  while (taken.has(`q${i}`)) i += 1;
  return `q${i}`;
}

export function nextName(schema: FormSchema): string {
  return freshName(new Set(allElements(schema).map((e) => e.name)));
}

/** Recursively replace the element named `name` via `fn`, anywhere in the tree. */
function mapTree(elements: Element[], name: string, fn: (el: Element) => Element): Element[] {
  return elements.map((el) => {
    if (el.name === name) return fn(el);
    if (el.elements) return { ...el, elements: mapTree(el.elements, name, fn) };
    return el;
  });
}

function mapElement(schema: FormSchema, name: string, fn: (el: Element) => Element): FormSchema {
  return {
    ...schema,
    pages: schema.pages.map((p) => ({ ...p, elements: mapTree(p.elements, name, fn) })),
  };
}

function removeFromTree(elements: Element[], name: string): Element[] {
  return elements
    .filter((el) => el.name !== name)
    .map((el) => (el.elements ? { ...el, elements: removeFromTree(el.elements, name) } : el));
}

/**
 * Find the sibling list that contains `name` and replace it with `fn(siblings, index)`.
 * Used for reordering and duplication, which act within one parent's child list.
 */
function transformSiblings(
  schema: FormSchema,
  name: string,
  fn: (siblings: Element[], index: number) => Element[],
): FormSchema {
  const visit = (els: Element[]): { els: Element[]; hit: boolean } => {
    const idx = els.findIndex((e) => e.name === name);
    if (idx !== -1) return { els: fn(els, idx), hit: true };
    let hit = false;
    const mapped = els.map((el) => {
      if (hit || !el.elements) return el;
      const r = visit(el.elements);
      if (r.hit) {
        hit = true;
        return { ...el, elements: r.els };
      }
      return el;
    });
    return { els: mapped, hit };
  };
  return {
    ...schema,
    pages: schema.pages.map((p) => {
      const r = visit(p.elements);
      return r.hit ? { ...p, elements: r.els } : p;
    }),
  };
}

function makeElement(type: ElementType, name: string): Element {
  const el: Element = { type, name, label: defaultLabelFor(type) };
  if (hasOptionList(type)) {
    el.options =
      type === "scale"
        ? [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))
        : [
            { value: "option_1", label: "Option 1" },
            { value: "option_2", label: "Option 2" },
          ];
  }
  if (type === "matrix") {
    el.rows = [
      { value: "row_1", label: "Row 1" },
      { value: "row_2", label: "Row 2" },
    ];
    el.columns = [
      { value: "col_1", label: "Column 1" },
      { value: "col_2", label: "Column 2" },
    ];
  }
  if (isContainerType(type)) el.elements = [];
  if (type === "repeat") el.repeat = { min: 0 };
  return el;
}

function cloneSubtree(el: Element, taken: Set<string>): Element {
  const name = freshName(taken);
  taken.add(name);
  const copy: Element = { ...structuredClone(el), name };
  if (copy.elements) copy.elements = copy.elements.map((child) => cloneSubtree(child, taken));
  return copy;
}

// ---------------------------------------------------------------- element ops

/** Insert a new element of `type` at a precise position (used by palette drag-to-canvas). */
export function addElementAt(
  schema: FormSchema,
  type: ElementType,
  target: { pageIndex: number; parentName?: string },
  index: number,
): { schema: FormSchema; name: string } {
  const name = nextName(schema);
  const el = makeElement(type, name);

  if (target.parentName) {
    const next = mapElement(schema, target.parentName, (parent) => {
      const children = [...(parent.elements ?? [])];
      children.splice(Math.max(0, Math.min(index, children.length)), 0, el);
      return { ...parent, elements: children };
    });
    return { schema: next, name };
  }

  const pages = schema.pages.map((p, i) => {
    if (i !== target.pageIndex) return p;
    const children = [...p.elements];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, el);
    return { ...p, elements: children };
  });
  return { schema: { ...schema, pages }, name };
}

/**
 * Wrap a set of sibling elements into a new group in-place.
 * All names must live in the same sibling list — if they span containers or pages the
 * schema is returned unchanged (groupName will be empty string).
 */
export function groupElements(
  schema: FormSchema,
  names: string[],
): { schema: FormSchema; groupName: string } {
  if (names.length < 2) return { schema, groupName: "" };

  const nameSet = new Set(names);
  const newGroupName = nextName(schema);
  let groupName = "";

  const tryGroup = (siblings: Element[]): Element[] | null => {
    const indices: number[] = [];
    siblings.forEach((e, i) => {
      if (nameSet.has(e.name)) indices.push(i);
    });
    if (indices.length !== names.length) return null;

    const minIdx = Math.min(...indices);
    const ordered = [...indices].sort((a, b) => a - b).map((i) => siblings[i]);
    const group: Element = {
      type: "group",
      name: newGroupName,
      label: defaultLabelFor("group"),
      elements: ordered,
    };
    groupName = newGroupName;

    const remaining = siblings.filter((e) => !nameSet.has(e.name));
    const insertPos = siblings.slice(0, minIdx).filter((e) => !nameSet.has(e.name)).length;
    return [...remaining.slice(0, insertPos), group, ...remaining.slice(insertPos)];
  };

  let changed = false;
  const walkList = (elements: Element[]): Element[] => {
    if (changed) return elements;
    const grouped = tryGroup(elements);
    if (grouped) {
      changed = true;
      return grouped;
    }
    let listChanged = false;
    const mapped = elements.map((el) => {
      if (!el.elements || changed) return el;
      const next = walkList(el.elements);
      if (next !== el.elements) {
        listChanged = true;
        return { ...el, elements: next };
      }
      return el;
    });
    return listChanged ? mapped : elements;
  };

  const pages = schema.pages.map((p) => {
    const walked = walkList(p.elements);
    return walked !== p.elements ? { ...p, elements: walked } : p;
  });

  if (!changed) return { schema, groupName: "" };
  return { schema: { ...schema, pages }, groupName };
}

/** Where an element lives: its page, its direct parent container (if any), and its index. */
export function locate(
  schema: FormSchema,
  name: string,
): { pageIndex: number; parentName?: string; index: number } | null {
  for (let pi = 0; pi < schema.pages.length; pi++) {
    const walk = (
      els: Element[],
      parent: string | undefined,
    ): { pageIndex: number; parentName?: string; index: number } | null => {
      const idx = els.findIndex((e) => e.name === name);
      if (idx >= 0) return { pageIndex: pi, parentName: parent, index: idx };
      for (const el of els) {
        if (el.elements) {
          const r = walk(el.elements, el.name);
          if (r) return r;
        }
      }
      return null;
    };
    const r = walk(schema.pages[pi].elements, undefined);
    if (r) return r;
  }
  return null;
}

/**
 * Drag-to-group: drop `dragged` onto `target`.
 * - If `target` already lives inside a group/section, `dragged` JOINS that group right
 *   after the target.
 * - Otherwise the two are wrapped into a brand-new group at the target's position.
 * Returns the (possibly unchanged) schema and the resulting group's name ("" = no-op).
 */
export function groupOrJoin(
  schema: FormSchema,
  dragged: string,
  target: string,
): { schema: FormSchema; groupName: string } {
  if (dragged === target) return { schema, groupName: "" };
  // Can't nest a container into one of its own descendants.
  if (isDescendantOf(schema, target, dragged)) return { schema, groupName: "" };
  const targetLoc = locate(schema, target);
  if (!targetLoc) return { schema, groupName: "" };

  // Target sits inside a group/section → the dragged question simply joins that group.
  if (targetLoc.parentName) {
    const next = moveElementTo(
      schema,
      dragged,
      { pageIndex: targetLoc.pageIndex, parentName: targetLoc.parentName },
      targetLoc.index + 1,
    );
    return next === schema
      ? { schema, groupName: "" }
      : { schema: next, groupName: targetLoc.parentName };
  }

  // Both top-level → relocate the dragged card next to the target, then wrap into a group.
  const moved = moveElementTo(
    schema,
    dragged,
    { pageIndex: targetLoc.pageIndex, parentName: undefined },
    targetLoc.index + 1,
  );
  return groupElements(moved, [target, dragged]);
}

/**
 * Dissolve a group/repeat: replace it with its children at the same position in the
 * parent's list. Returns the schema unchanged if `name` is not a container.
 */
export function ungroupElement(
  schema: FormSchema,
  name: string,
): { schema: FormSchema; childNames: string[] } {
  const el = findElement(schema, name);
  if (!el || !isContainerType(el.type)) return { schema, childNames: [] };
  const children = el.elements ?? [];
  const next = transformSiblings(schema, name, (siblings, idx) => [
    ...siblings.slice(0, idx),
    ...children,
    ...siblings.slice(idx + 1),
  ]);
  return { schema: next, childNames: children.map((c) => c.name) };
}

export function addElement(
  schema: FormSchema,
  type: ElementType,
  opts: { pageIndex?: number; parentName?: string } = {},
): { schema: FormSchema; name: string } {
  const name = nextName(schema);
  const el = makeElement(type, name);

  // Add inside a container when one is targeted, else append to the active page.
  if (opts.parentName) {
    const next = mapElement(schema, opts.parentName, (parent) => ({
      ...parent,
      elements: [...(parent.elements ?? []), el],
    }));
    return { schema: next, name };
  }

  const pageIndex = opts.pageIndex ?? 0;
  const pages = schema.pages.map((p, i) =>
    i === pageIndex ? { ...p, elements: [...p.elements, el] } : p,
  );
  return { schema: { ...schema, pages }, name };
}

export function updateElement(
  schema: FormSchema,
  name: string,
  patch: Partial<Element>,
): FormSchema {
  return mapElement(schema, name, (el) => ({ ...el, ...patch }));
}

export function removeElement(schema: FormSchema, name: string): FormSchema {
  return {
    ...schema,
    pages: schema.pages.map((p) => ({ ...p, elements: removeFromTree(p.elements, name) })),
  };
}

export function duplicateElement(
  schema: FormSchema,
  name: string,
): { schema: FormSchema; name: string } {
  const taken = new Set(allElements(schema).map((e) => e.name));
  let newName = name;
  const next = transformSiblings(schema, name, (siblings, idx) => {
    const copy = cloneSubtree(siblings[idx], taken);
    newName = copy.name;
    return [...siblings.slice(0, idx + 1), copy, ...siblings.slice(idx + 1)];
  });
  return { schema: next, name: newName };
}

/** Move an element to a new index within its own sibling list (clamped). */
export function moveElement(schema: FormSchema, name: string, toIndex: number): FormSchema {
  return transformSiblings(schema, name, (siblings, from) => {
    const clamped = Math.max(0, Math.min(toIndex, siblings.length - 1));
    const copy = [...siblings];
    const [moved] = copy.splice(from, 1);
    copy.splice(clamped, 0, moved);
    return copy;
  });
}

/** True when `name` is (or is nested anywhere inside) the element `ancestorName`. */
export function isDescendantOf(schema: FormSchema, name: string, ancestorName: string): boolean {
  if (name === ancestorName) return true;
  const ancestor = findElement(schema, ancestorName);
  if (!ancestor?.elements) return false;
  const walk = (els: Element[]): boolean =>
    els.some((el) => el.name === name || (el.elements ? walk(el.elements) : false));
  return walk(ancestor.elements);
}

/**
 * Move an element (with its subtree) to a new parent — a page's top level or a container —
 * at `index` within the target's child list. Powers drag-and-drop across containers.
 * No-ops when the move would nest a container inside itself or its own descendants.
 */
export function moveElementTo(
  schema: FormSchema,
  name: string,
  target: { pageIndex: number; parentName?: string },
  index: number,
): FormSchema {
  const el = findElement(schema, name);
  if (!el) return schema;
  if (target.parentName && isDescendantOf(schema, target.parentName, name)) return schema;

  const without = removeElement(schema, name);

  if (target.parentName) {
    return mapElement(without, target.parentName, (parent) => {
      const children = [...(parent.elements ?? [])];
      const clamped = Math.max(0, Math.min(index, children.length));
      children.splice(clamped, 0, el);
      return { ...parent, elements: children };
    });
  }

  return {
    ...without,
    pages: without.pages.map((p, i) => {
      if (i !== target.pageIndex) return p;
      const children = [...p.elements];
      const clamped = Math.max(0, Math.min(index, children.length));
      children.splice(clamped, 0, el);
      return { ...p, elements: children };
    }),
  };
}

export function moveBy(schema: FormSchema, name: string, delta: number): FormSchema {
  return transformSiblings(schema, name, (siblings, from) => {
    const to = Math.max(0, Math.min(from + delta, siblings.length - 1));
    const copy = [...siblings];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
  });
}

// ---------------------------------------------------------------- list-field editing
type ListField = "options" | "rows" | "columns";

function addListItem(
  schema: FormSchema,
  name: string,
  field: ListField,
  prefix: string,
): FormSchema {
  return mapElement(schema, name, (el) => {
    const list = (el[field] as Choice[] | undefined) ?? [];
    const n = list.length + 1;
    return { ...el, [field]: [...list, { value: `${prefix}_${n}`, label: `${cap(prefix)} ${n}` }] };
  });
}

function updateListItem(
  schema: FormSchema,
  name: string,
  field: ListField,
  index: number,
  patch: Partial<Choice>,
): FormSchema {
  return mapElement(schema, name, (el) => {
    const list = ((el[field] as Choice[] | undefined) ?? []).map((it, i) =>
      i === index ? { ...it, ...patch } : it,
    );
    return { ...el, [field]: list };
  });
}

function removeListItem(
  schema: FormSchema,
  name: string,
  field: ListField,
  index: number,
): FormSchema {
  return mapElement(schema, name, (el) => ({
    ...el,
    [field]: ((el[field] as Choice[] | undefined) ?? []).filter((_, i) => i !== index),
  }));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const addOption = (s: FormSchema, name: string) => addListItem(s, name, "options", "option");
export const updateOption = (s: FormSchema, name: string, i: number, patch: Partial<Choice>) =>
  updateListItem(s, name, "options", i, patch);
export const removeOption = (s: FormSchema, name: string, i: number) =>
  removeListItem(s, name, "options", i);

export const addRow = (s: FormSchema, name: string) => addListItem(s, name, "rows", "row");
export const updateRow = (s: FormSchema, name: string, i: number, patch: Partial<Choice>) =>
  updateListItem(s, name, "rows", i, patch);
export const removeRow = (s: FormSchema, name: string, i: number) =>
  removeListItem(s, name, "rows", i);

export const addColumn = (s: FormSchema, name: string) => addListItem(s, name, "columns", "col");
export const updateColumn = (s: FormSchema, name: string, i: number, patch: Partial<Choice>) =>
  updateListItem(s, name, "columns", i, patch);
export const removeColumn = (s: FormSchema, name: string, i: number) =>
  removeListItem(s, name, "columns", i);

// ---------------------------------------------------------------- page ops
export function addPage(schema: FormSchema): { schema: FormSchema; index: number } {
  const taken = new Set(schema.pages.map((p) => p.name));
  let i = schema.pages.length + 1;
  while (taken.has(`page${i}`)) i += 1;
  const page: Page = { name: `page${i}`, title: `Page ${schema.pages.length + 1}`, elements: [] };
  return { schema: { ...schema, pages: [...schema.pages, page] }, index: schema.pages.length };
}

/** Remove a page (no-op if it's the last remaining page). */
export function removePage(schema: FormSchema, index: number): FormSchema {
  if (schema.pages.length <= 1) return schema;
  return { ...schema, pages: schema.pages.filter((_, i) => i !== index) };
}

export function renamePage(schema: FormSchema, index: number, title: string): FormSchema {
  return { ...schema, pages: schema.pages.map((p, i) => (i === index ? { ...p, title } : p)) };
}

/** Set (or clear, when empty) a page's `visibleIf` condition — skips the whole page. */
export function setPageVisibleIf(
  schema: FormSchema,
  index: number,
  visibleIf: string | undefined,
): FormSchema {
  return {
    ...schema,
    pages: schema.pages.map((p, i) =>
      i === index ? { ...p, visibleIf: visibleIf || undefined } : p,
    ),
  };
}

/** Update the conditional branching rules for a page. */
export function setPageNextPageIf(
  schema: FormSchema,
  index: number,
  nextPageIf: Array<{ condition: string; page: string }> | undefined,
): FormSchema {
  return {
    ...schema,
    pages: schema.pages.map((p, i) =>
      i === index
        ? { ...p, nextPageIf: nextPageIf && nextPageIf.length > 0 ? nextPageIf : undefined }
        : p,
    ),
  };
}

// ── i18n migration ──────────────────────────────────────────────

function upgradeI18n(value: I18nString | undefined, lang: string): I18nString | undefined {
  if (value == null || value === "") return value;
  if (typeof value !== "string") return value; // already an object
  return { [lang]: value };
}

function migrateElement(el: Element, lang: string): Element {
  const updated: Element = {
    ...el,
    label: upgradeI18n(el.label, lang),
    hint: upgradeI18n(el.hint, lang),
    placeholder: upgradeI18n(el.placeholder, lang),
  };
  if (el.repeat) {
    updated.repeat = {
      ...el.repeat,
      entryLabel: upgradeI18n(el.repeat.entryLabel, lang),
      addButtonText: upgradeI18n(el.repeat.addButtonText, lang),
    };
  }
  if (el.options) {
    updated.options = el.options.map((o) => ({ ...o, label: upgradeI18n(o.label, lang) }));
  }
  if (el.rows) {
    updated.rows = el.rows.map((r) => ({ ...r, label: upgradeI18n(r.label, lang) }));
  }
  if (el.columns) {
    updated.columns = el.columns.map((c) => ({ ...c, label: upgradeI18n(c.label, lang) }));
  }
  if (el.elements) {
    updated.elements = el.elements.map((child) => migrateElement(child, lang));
  }
  return updated;
}

/** Convert all plain-string i18n values to `{lang: text}` objects.
 * Called when the form gains its first translation language so translators
 * have a source string to work from in every field. */
export function migrateStringsToI18n(schema: FormSchema, defaultLang: string): FormSchema {
  const s = schema.settings;
  return {
    ...schema,
    title: upgradeI18n(schema.title, defaultLang) ?? "",
    description: upgradeI18n(schema.description, defaultLang),
    settings: s
      ? {
          ...s,
          submitButtonText: upgradeI18n(s.submitButtonText, defaultLang),
          confirmationMessage: upgradeI18n(s.confirmationMessage, defaultLang),
          welcomeTitle: upgradeI18n(s.welcomeTitle, defaultLang),
          welcomeMessage: upgradeI18n(s.welcomeMessage, defaultLang),
        }
      : s,
    pages: schema.pages.map((p) => ({
      ...p,
      title: upgradeI18n(p.title, defaultLang) ?? "",
      elements: p.elements.map((el) => migrateElement(el, defaultLang)),
    })),
  };
}

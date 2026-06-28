import { localize } from "@/lib/i18n";
/**
 * Form checker — a live linter that scans the form *definition* for valuable notes the
 * author should see: dangling references, logic that can never fire, options a rule points
 * at that no longer exist, circular calculations, and so on.
 *
 * Pure schema analysis (no side effects), so it runs on every edit for instant feedback.
 * The server's `validate_form` stays authoritative on publish; this surfaces the same class
 * of problems — plus warnings — live in the builder.
 *
 * Results are cached per schema object identity (the store replaces the schema immutably on
 * every change) so many callers — the Checks panel and every card badge — share one pass.
 */
import type { Choice, Element, FormSchema } from "@/types/form-schema";
import { type LogicCondition, NO_VALUE_OPS, parseLogic } from "./logic";
import { allElements } from "./model";

export type NoteLevel = "error" | "warning";

export interface FormNote {
  level: NoteLevel;
  /** A short stable code for the kind of note (e.g. "dangling-ref"). */
  code: string;
  /** The question to badge / jump to. Undefined for form-level notes. */
  elementName?: string;
  message: string;
}

const LOGIC_ATTRS = ["visibleIf", "requiredIf", "enableIf"] as const;

/** Field identifiers an expression reads, excluding function names, string literals, keywords. */
function referencedNames(expression: string): string[] {
  // Blank out string literals so identifiers inside them aren't mistaken for field refs.
  const src = expression.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  const calls = new Set([...src.matchAll(/([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]));
  const LITERALS = new Set(["True", "False", "None", "true", "false", "null", "and", "or", "not"]);
  const out = new Set<string>();
  for (const id of src.match(/[A-Za-z_]\w*/g) ?? []) {
    if (!calls.has(id) && !LITERALS.has(id)) out.add(id);
  }
  return [...out];
}

const optionValues = (el: Element): Set<string> =>
  new Set((el.options ?? []).map((o: Choice) => String(o.value)));

const elementLabel = (el: Element): string => localize(el.label) || el.name;

/** Detect circular `calculate` references (a → b → a) among calculated fields. */
function circularCalcNames(byName: Map<string, Element>): Set<string> {
  const deps = new Map<string, string[]>();
  for (const el of byName.values()) {
    if (el.calculate) {
      deps.set(
        el.name,
        referencedNames(el.calculate).filter((n) => byName.get(n)?.calculate),
      );
    }
  }
  const cyclic = new Set<string>();
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (name: string, stack: string[]) => {
    const st = state.get(name) ?? 0;
    if (st === 2) return;
    if (st === 1) {
      for (const n of stack.slice(stack.indexOf(name))) cyclic.add(n);
      return;
    }
    state.set(name, 1);
    stack.push(name);
    for (const d of deps.get(name) ?? []) visit(d, stack);
    stack.pop();
    state.set(name, 2);
  };
  for (const name of deps.keys()) visit(name, []);
  return cyclic;
}

/** Inspect one parsed condition for references that point at nothing valid. */
function checkCondition(
  owner: Element,
  attr: string,
  cond: LogicCondition,
  byName: Map<string, Element>,
  notes: FormNote[],
): void {
  if (NO_VALUE_OPS.has(cond.op)) return;
  const target = byName.get(cond.field);
  if (!target) return; // dangling field handled separately, on the raw expression
  // A rule that compares a choice field to a value no option provides can never match.
  if ((target.options?.length ?? 0) > 0 && (cond.op === "==" || cond.op === "contains")) {
    if (!optionValues(target).has(String(cond.value))) {
      notes.push({
        level: "warning",
        code: "stale-option-ref",
        elementName: owner.name,
        message: `${attr} compares "${elementLabel(target)}" to "${cond.value}", which isn't one of its options — it can never match.`,
      });
    }
  }
}

/** Detect `field == "a" and field == "b"` — mutually exclusive, so the rule never fires. */
function contradictionNote(owner: Element, attr: string, conds: LogicCondition[]): FormNote | null {
  const eq = new Map<string, Set<string>>();
  for (const c of conds) {
    if (c.op !== "==") continue;
    const set = eq.get(c.field) ?? new Set<string>();
    set.add(String(c.value));
    eq.set(c.field, set);
  }
  for (const [, values] of eq) {
    if (values.size > 1) {
      return {
        level: "warning",
        code: "contradiction",
        elementName: owner.name,
        message: `${attr} requires the same question to equal two different values at once — it can never be true.`,
      };
    }
  }
  return null;
}

/** Lint a form definition: returns notes ordered errors-first. Cached per schema object. */
export function lintForm(schema: FormSchema): FormNote[] {
  const cached = CACHE.get(schema);
  if (cached) return cached;

  const notes: FormNote[] = [];
  const els = allElements(schema);
  const byName = new Map<string, Element>();
  const counts = new Map<string, number>();
  for (const el of els) {
    counts.set(el.name, (counts.get(el.name) ?? 0) + 1);
    if (!byName.has(el.name)) byName.set(el.name, el);
  }
  const known = new Set(byName.keys());

  // Duplicate field names.
  for (const [name, n] of counts) {
    if (n > 1) {
      notes.push({
        level: "error",
        code: "duplicate-name",
        elementName: name,
        message: `Duplicate field key "${name}" — keys must be unique (used in data, logic & exports).`,
      });
    }
  }

  const cyclic = circularCalcNames(byName);

  for (const el of els) {
    // Choice questions need options; matrix needs rows + columns.
    if (
      ["single_choice", "multi_choice", "dropdown", "ranking"].includes(el.type) &&
      !(el.options?.length || el.optionsFrom)
    ) {
      notes.push({
        level: "error",
        code: "no-options",
        elementName: el.name,
        message: `"${elementLabel(el)}" is a choice question with no options.`,
      });
    }
    if (el.type === "matrix" && !(el.rows?.length && el.columns?.length)) {
      notes.push({
        level: "error",
        code: "matrix-incomplete",
        elementName: el.name,
        message: `"${elementLabel(el)}" (matrix) needs both rows and columns.`,
      });
    }

    // Duplicate option values within one question.
    const seen = new Set<string>();
    for (const o of el.options ?? []) {
      const v = String(o.value);
      if (seen.has(v)) {
        notes.push({
          level: "warning",
          code: "duplicate-option",
          elementName: el.name,
          message: `"${elementLabel(el)}" has two options with the value "${v}".`,
        });
      }
      seen.add(v);
    }

    // Circular calculate.
    if (cyclic.has(el.name)) {
      notes.push({
        level: "error",
        code: "circular-calc",
        elementName: el.name,
        message: `"${elementLabel(el)}" is part of a circular calculation — it can't be computed.`,
      });
    }

    // Logic + calculate: dangling refs (raw scan) + structured checks (parsed).
    const exprs: Array<[string, string | undefined]> = [
      ...LOGIC_ATTRS.map((a) => [a, el[a]] as [string, string | undefined]),
      ["calculate", el.calculate],
    ];
    for (const [attr, expr] of exprs) {
      if (!expr) continue;
      for (const ref of referencedNames(expr)) {
        if (ref === el.name) {
          notes.push({
            level: "warning",
            code: "self-ref",
            elementName: el.name,
            message: `${attr} of "${elementLabel(el)}" references itself.`,
          });
        } else if (!known.has(ref)) {
          notes.push({
            level: "error",
            code: "dangling-ref",
            elementName: el.name,
            message: `${attr} of "${elementLabel(el)}" references "${ref}", which no longer exists.`,
          });
        }
      }
    }
    for (const attr of LOGIC_ATTRS) {
      const parsed = el[attr] ? parseLogic(el[attr] as string) : null;
      if (!parsed) continue;
      for (const cond of parsed.conditions) checkCondition(el, attr, cond, byName, notes);
      if (parsed.connective === "and") {
        const note = contradictionNote(el, attr, parsed.conditions);
        if (note) notes.push(note);
      }
    }
  }

  notes.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  CACHE.set(schema, notes);
  return notes;
}

const CACHE = new WeakMap<FormSchema, FormNote[]>();

/** Notes grouped by the element they belong to (form-level notes under ""). */
export function notesByElement(schema: FormSchema): Map<string, FormNote[]> {
  const map = new Map<string, FormNote[]>();
  for (const note of lintForm(schema)) {
    const key = note.elementName ?? "";
    const list = map.get(key) ?? [];
    list.push(note);
    map.set(key, list);
  }
  return map;
}

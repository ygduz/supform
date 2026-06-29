/**
 * Dependency-ordered recalculation of `calculate` fields — the client mirror of the
 * backend `app/form_engine/recalc.py`. Calculated questions are spreadsheet cells: each
 * formula references others by key. We build the dependency graph, evaluate in topological
 * order (so a formula may reference a field defined later in the form), and detect cycles.
 *
 * Live preview only — the server recomputes authoritatively. Groups are transparent (we
 * descend into them); repeats are isolated scopes (we don't).
 */
import type { Element } from "@/types/form-schema";
import { evaluateExpression } from "./expressions";

// Expression-language keywords/operators that are never field references.
const LITERALS = new Set([
  "True",
  "False",
  "None",
  "true",
  "false",
  "null",
  "and",
  "or",
  "not",
  "in",
]);

/** Field identifiers an expression reads, excluding function names and literals. */
export function referencedNames(expression: string): Set<string> {
  // Blank out string literals so identifiers inside them aren't mistaken for field refs
  // (the backend parses an AST, where string contents are never identifiers).
  const src = expression.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  const calls = new Set([...src.matchAll(/([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]));
  const out = new Set<string>();
  for (const id of src.match(/[A-Za-z_]\w*/g) ?? []) {
    if (!calls.has(id) && !LITERALS.has(id)) out.add(id);
  }
  return out;
}

/** Map calc field name -> expression for one scope (descends groups, skips repeats). */
export function collectCalcs(elements: Element[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (els: Element[]) => {
    for (const el of els) {
      if (el.type === "calculated" && el.calculate) out.set(el.name, el.calculate);
      else if (el.type === "group" && el.elements) walk(el.elements);
    }
  };
  walk(elements);
  return out;
}

/** Topological evaluation order plus the set of names caught in a cycle (excluded). */
export function topoOrder(calcs: Map<string, string>): { order: string[]; cyclic: Set<string> } {
  const deps = new Map<string, string[]>();
  for (const [name, expr] of calcs) {
    deps.set(
      name,
      [...referencedNames(expr)].filter((n) => calcs.has(n)),
    );
  }
  const order: string[] = [];
  const state = new Map<string, 0 | 1 | 2>();
  const cyclic = new Set<string>();

  const visit = (name: string, stack: string[]) => {
    const st = state.get(name) ?? 0;
    if (st === 2) return;
    if (st === 1) {
      const i = stack.indexOf(name);
      for (const n of stack.slice(i)) cyclic.add(n);
      return;
    }
    state.set(name, 1);
    stack.push(name);
    for (const dep of deps.get(name) ?? []) visit(dep, stack);
    stack.pop();
    state.set(name, 2);
    if (!cyclic.has(name)) order.push(name);
  };

  for (const name of calcs.keys()) visit(name, []);
  return { order: order.filter((n) => !cyclic.has(n)), cyclic };
}

/**
 * Compute every calc field for a scope in dependency order. Returns the computed values
 * (merged view of answers + derived) and the set of fields skipped due to a cycle.
 */
export function recalc(
  elements: Element[],
  answers: Record<string, unknown>,
): { values: Record<string, unknown>; cyclic: Set<string> } {
  const calcs = collectCalcs(elements);
  const values: Record<string, unknown> = { ...answers };
  if (calcs.size === 0) return { values, cyclic: new Set() };
  const { order, cyclic } = topoOrder(calcs);
  for (const name of order) {
    try {
      const v = evaluateExpression(calcs.get(name), values);
      // Skip undefined and non-finite numbers (NaN/Infinity). A formula whose inputs are
      // still unanswered yields NaN (`undefined * undefined`); storing it would make the
      // renderer's `derived[name] ?? evaluate(...)` keep NaN, and its `!==` write-back
      // guard (NaN !== NaN is always true) would loop setState every render.
      if (v === undefined) continue;
      if (typeof v === "number" && !Number.isFinite(v)) continue;
      values[name] = v;
    } catch {
      /* fail-safe: leave unset */
    }
  }
  return { values, cyclic };
}

/**
 * Client-side expression evaluation for live form logic (visibleIf, etc.).
 *
 * IMPORTANT: this is for *interactivity only*. The backend re-validates every submission
 * with its own authoritative engine (app/form_engine), so this never needs to be trusted.
 *
 * M2 will replace the regex shim below with a proper shared parser (compiled from the
 * same grammar the Python engine uses) so client and server logic can never diverge.
 */
import { EXCEL_FUNCTIONS, isFunctionName } from "./functions";

const JS_KEYWORDS = new Set([
  "true",
  "false",
  "null",
  "undefined",
  "return",
  "if",
  "else",
  "and",
  "or",
  "not",
  "selected",
  "in",
  "instanceof",
  "typeof",
  "void",
  "delete",
  "new",
  "this",
]);

const selected = (value: unknown, option: unknown): boolean =>
  Array.isArray(value) ? value.includes(option) : value === option;

/**
 * Build the variable scope for an expression: every identifier it mentions becomes a
 * Function parameter. Catalog functions (any case) bind to the shared implementation;
 * remaining identifiers bind to the field value via `seed` (so unanswered fields don't
 * throw ReferenceError). JS keywords/literals are left for the language to handle.
 */
function buildScope(expression: string, seed: (id: string) => unknown): Record<string, unknown> {
  const idents = new Set(expression.match(/[A-Za-z_]\w*/g) ?? []);
  const scope: Record<string, unknown> = { selected };
  for (const id of idents) {
    if (isFunctionName(id)) {
      scope[id] = EXCEL_FUNCTIONS[id.toLowerCase()];
      continue;
    }
    if (JS_KEYWORDS.has(id)) continue;
    scope[id] = seed(id);
  }
  return scope;
}

export function evaluateBool(
  expression: string | undefined,
  context: Record<string, unknown>,
): boolean {
  if (!expression) return true;
  try {
    const scope = buildScope(expression, (id) => (id in context ? context[id] : undefined));
    const fn = new Function(...Object.keys(scope), `return (${toJs(expression)});`);
    return Boolean(fn(...Object.values(scope)));
  } catch {
    return true;
  }
}

function toJs(expr: string): string {
  return expr
    .replace(/\band\b/g, "&&")
    .replace(/\bor\b/g, "||")
    .replace(/\bnot\b/g, "!")
    .replace(/([^=!<>])=([^=])/g, "$1==$2")
    .replace(/\bNone\b/g, "null")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false");
}

/**
 * Evaluate an expression against raw answer values, returning the raw result — the exact
 * mirror of the backend `evaluate()` (no numeric pre-coercion, no boolean wrapping). Used
 * by the parity test suite and anywhere a faithful server-equivalent result is needed.
 */
export function evaluateExpression(
  expression: string | undefined,
  context: Record<string, unknown>,
): unknown {
  if (!expression) return undefined;
  const scope = buildScope(expression, (id) => (id in context ? context[id] : undefined));
  const fn = new Function(...Object.keys(scope), `return (${toJs(expression)});`);
  return fn(...Object.values(scope));
}

/**
 * Evaluate an arithmetic `calculate` expression (e.g. `qty * unit_price`) against the
 * current answers. Referenced fields that aren't answered yet default to 0 so partial
 * forms still compute. Interactivity only — the server recomputes authoritatively.
 */
export const evaluate = evaluateValue;

export function evaluateValue(
  expression: string | undefined,
  context: Record<string, unknown>,
): number | string | undefined {
  if (!expression) return undefined;
  try {
    // Seed unknown/blank refs with 0 (numeric default) so partial forms still compute;
    // catalog functions bind via buildScope. Functions receive raw values (their own
    // coercion mirrors the backend), so only plain field refs get the numeric default.
    const scope = buildScope(expression, (id) => {
      const v = context[id];
      const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      return typeof n === "number" && !Number.isNaN(n) ? n : (v ?? 0);
    });
    const fn = new Function(...Object.keys(scope), `return (${expression});`);
    const out = fn(...Object.values(scope));
    if (typeof out === "number") return Number.isFinite(out) ? out : undefined;
    return out;
  } catch {
    return undefined;
  }
}

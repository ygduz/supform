/**
 * Client-side expression evaluation for live form logic (visibleIf, etc.).
 *
 * IMPORTANT: this is for *interactivity only*. The backend re-validates every submission
 * with its own authoritative engine (app/form_engine), so this never needs to be trusted.
 *
 * M2 will replace the regex shim below with a proper shared parser (compiled from the
 * same grammar the Python engine uses) so client and server logic can never diverge.
 */
export function evaluateBool(
  expression: string | undefined,
  context: Record<string, unknown>,
): boolean {
  if (!expression) return true;
  try {
    const selected = (value: unknown, option: unknown): boolean =>
      Array.isArray(value) ? value.includes(option) : value === option;
    // Seed every field identifier in the expression so the Function call never throws
    // ReferenceError for unanswered fields. Skip JS keywords/literals so we don't try
    // to pass `true`, `null`, `return`, etc. as Function parameter names.
    const JS_KEYWORDS = new Set([
      "true","false","null","undefined","return","if","else","and","or","not",
      "selected","in","instanceof","typeof","void","delete","new","this",
    ]);
    const idents = new Set(expression.match(/[A-Za-z_]\w*/g) ?? []);
    const scope: Record<string, unknown> = { selected };
    for (const id of idents) {
      if (!JS_KEYWORDS.has(id)) scope[id] = id in context ? context[id] : undefined;
    }
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
    .replace(/\bNone\b/g, "null");
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
    // Every identifier the expression mentions must be a defined argument, or the
    // Function throws ReferenceError. Seed unknown/blank refs with 0 (numeric default).
    const idents = new Set(expression.match(/[A-Za-z_]\w*/g) ?? []);
    const scope: Record<string, unknown> = {};
    for (const id of idents) {
      const v = context[id];
      const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      scope[id] = typeof n === "number" && !Number.isNaN(n) ? n : (v ?? 0);
    }
    const fn = new Function(...Object.keys(scope), `return (${expression});`);
    const out = fn(...Object.values(scope));
    if (typeof out === "number") return Number.isFinite(out) ? out : undefined;
    return out;
  } catch {
    return undefined;
  }
}

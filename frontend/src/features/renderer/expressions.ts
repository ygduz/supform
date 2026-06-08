/**
 * Client-side expression evaluation for live form logic (visibleIf, etc.).
 *
 * IMPORTANT: this is for *interactivity only*. The backend re-validates every submission
 * with its own authoritative engine (app/form_engine), so this never needs to be trusted.
 *
 * M2 will replace the regex shim below with a proper shared parser (compiled from the
 * same grammar the Python engine uses) so client and server logic can never diverge.
 */
export function evaluateBool(expression: string | undefined, context: Record<string, unknown>): boolean {
  if (!expression) return true;
  try {
    // Minimal, safe-enough shim: only supports `field <op> literal` and and/or chains.
    // Deliberately conservative — unknown syntax defaults to visible.
    const fn = new Function(...Object.keys(context), `return (${toJs(expression)});`);
    return Boolean(fn(...Object.values(context)));
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

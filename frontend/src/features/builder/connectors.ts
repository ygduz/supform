/**
 * Connectors — the bridge between a question's `visibleIf` expression and the visual
 * connector lines drawn on the builder canvas.
 *
 * A connector is the simple, picker-generated shape of conditional logic:
 *
 *     <fromField> == <value>      (show the target when the source equals a value)
 *     <fromField> != <value>      (show the target unless the source equals a value)
 *
 * The value is emitted as a *type-correct* literal so the runtime comparison matches the
 * stored answer: booleans/numbers are bare (`q1 == true`, `q1 == 3`) and strings are
 * quoted (`q1 == "yes"`). This matters — a boolean answer is the JS value `true`, and
 * `true == "true"` is false, so quoting a boolean would make the condition never fire.
 *
 * Both ends (the store that writes visibleIf and the layer that parses it back to draw a
 * line) go through here, so the format can never drift between writer and reader.
 */
import type { Element, FormSchema } from "@/types/form-schema";

export type ConnOp = "==" | "!=";

export interface Connector {
  fromName: string;
  toName: string;
  op: ConnOp;
  /** The matched value, with its original type preserved. */
  value: string | number | boolean;
  /** Human-friendly value for the connector pill (e.g. "Yes" for a boolean true). */
  display: string;
}

/** Render a JS-literal for a connector value, quoting only strings. */
function literal(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Build the `visibleIf` expression for a connector. */
export function buildConnectorExpression(
  fromName: string,
  op: ConnOp,
  value: string | number | boolean,
): string {
  return `${fromName} ${op} ${literal(value)}`;
}

// Matches `field == "str"` / `field != 'str'` / `field == true` / `field == 3`.
const CONN_RE =
  /^(\w+)\s*(==|!=)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(true|false)|(-?\d+(?:\.\d+)?))$/;

function unescapeLiteral(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

/** Parse a `visibleIf` expression back into a connector, or null if it isn't connector-shaped. */
export function parseConnector(toName: string, visibleIf: string | undefined): Connector | null {
  if (!visibleIf) return null;
  const m = visibleIf.trim().match(CONN_RE);
  if (!m) return null;
  const [, fromName, op, dq, sq, bool, num] = m;
  let value: string | number | boolean;
  if (dq !== undefined) value = unescapeLiteral(dq);
  else if (sq !== undefined) value = unescapeLiteral(sq);
  else if (bool !== undefined) value = bool === "true";
  else value = Number(num);
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return { fromName, toName, op: op as ConnOp, value, display };
}

/** Every connector implied by `visibleIf` across the whole form tree. */
export function collectConnectors(schema: FormSchema): Connector[] {
  const out: Connector[] = [];
  const walk = (els: Element[]) => {
    for (const el of els) {
      const c = parseConnector(el.name, el.visibleIf);
      if (c) out.push(c);
      if (el.elements) walk(el.elements);
    }
  };
  for (const page of schema.pages) walk(page.elements);
  return out;
}

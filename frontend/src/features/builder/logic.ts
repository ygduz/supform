/**
 * Structured (mis)representation of the simple subset of the expression language that
 * the visual logic builder can edit: `field <op> literal` conditions joined by a single
 * `and`/`or` connective. Anything more complex round-trips through the raw-text
 * "advanced" editor instead — parseLogic returns null and the UI falls back.
 */

export type LogicOp = "==" | "!=" | ">" | ">=" | "<" | "<=";

export interface LogicCondition {
  field: string;
  op: LogicOp;
  value: string | number | boolean;
}

export interface ParsedLogic {
  connective: "and" | "or";
  conditions: LogicCondition[];
}

export const LOGIC_OPS: { op: LogicOp; label: string }[] = [
  { op: "==", label: "equals" },
  { op: "!=", label: "does not equal" },
  { op: ">", label: "is greater than" },
  { op: ">=", label: "is at least" },
  { op: "<", label: "is less than" },
  { op: "<=", label: "is at most" },
];

const CONDITION_RE = /^([A-Za-z_]\w*)\s*(==|!=|>=|<=|>|<|=)\s*(.+)$/;

/** Parse one `field op literal` condition; null when it doesn't match the simple shape. */
function parseCondition(src: string): LogicCondition | null {
  const m = CONDITION_RE.exec(src.trim());
  if (!m) return null;
  const op = (m[2] === "=" ? "==" : m[2]) as LogicOp;
  const value = parseLiteral(m[3].trim());
  if (value === undefined) return null;
  return { field: m[1], op, value };
}

function parseLiteral(src: string): string | number | boolean | undefined {
  if (/^(["']).*\1$/.test(src)) return src.slice(1, -1);
  if (src === "true" || src === "True") return true;
  if (src === "false" || src === "False") return false;
  if (/^-?\d+(\.\d+)?$/.test(src)) return Number(src);
  // A bare word would be a field reference — beyond the simple builder.
  return undefined;
}

/**
 * Parse an expression string into builder-editable structure.
 * Returns null when the expression uses anything beyond `cond (and|or cond)*` with a
 * single consistent connective (parentheses, not, mixed and/or, function calls, …).
 */
export function parseLogic(expression: string): ParsedLogic | null {
  const src = expression.trim();
  if (!src || /[()]/.test(src) || /\bnot\b/.test(src)) return null;

  const parts = src.split(/\s+(and|or)\s+/);
  // split with a capture group yields [cond, conn, cond, conn, cond, ...]
  const conditions: LogicCondition[] = [];
  const connectives = new Set<string>();
  for (let i = 0; i < parts.length; i += 1) {
    if (i % 2 === 0) {
      const cond = parseCondition(parts[i]);
      if (!cond) return null;
      conditions.push(cond);
    } else {
      connectives.add(parts[i]);
    }
  }
  if (conditions.length === 0 || connectives.size > 1) return null;
  return {
    connective: (connectives.values().next().value as "and" | "or") ?? "and",
    conditions,
  };
}

function serializeLiteral(value: string | number | boolean): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

/** Serialize builder structure back to the expression string ("" when no conditions). */
export function serializeLogic(logic: ParsedLogic): string {
  return logic.conditions
    .map((c) => `${c.field} ${c.op} ${serializeLiteral(c.value)}`)
    .join(` ${logic.connective} `);
}

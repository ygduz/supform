/**
 * Structured representation of the simple subset of the expression language that
 * the visual logic builder can edit: `field <op> literal` conditions joined by a single
 * `and`/`or` connective. Anything more complex round-trips through the raw-text
 * "advanced" editor instead — parseLogic returns null and the UI falls back.
 */

export type LogicOp =
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "contains"
  | "not_contains"
  | "is_answered"
  | "is_empty";

export interface LogicCondition {
  field: string;
  op: LogicOp;
  value: string | number | boolean;
}

export interface ParsedLogic {
  connective: "and" | "or";
  conditions: LogicCondition[];
}

/** Ops that require no right-hand value (null checks). */
export const NO_VALUE_OPS = new Set<LogicOp>(["is_answered", "is_empty"]);

const _ALL: { op: LogicOp; label: string }[] = [
  { op: "==", label: "equals" },
  { op: "!=", label: "does not equal" },
  { op: "contains", label: "includes" },
  { op: "not_contains", label: "does not include" },
  { op: ">", label: "is greater than" },
  { op: ">=", label: "is at least" },
  { op: "<", label: "is less than" },
  { op: "<=", label: "is at most" },
  { op: "is_answered", label: "is answered" },
  { op: "is_empty", label: "is empty" },
];

const NUMERIC_OPS: LogicOp[] = ["==", "!=", ">", ">=", "<", "<=", "is_answered", "is_empty"];
const CHOICE_OPS: LogicOp[] = ["==", "!=", "is_answered", "is_empty"];
const MULTI_OPS: LogicOp[] = ["contains", "not_contains", "is_answered", "is_empty"];
const BOOL_OPS: LogicOp[] = ["==", "is_answered", "is_empty"];
const TEXT_OPS: LogicOp[] = ["==", "!=", "is_answered", "is_empty"];

const NUMERIC_TYPES = new Set(["number", "integer", "decimal", "rating", "scale"]);
const DATE_TYPES = new Set(["date", "time", "datetime"]);
const CHOICE_TYPES = new Set(["single_choice", "dropdown", "ranking"]);

/** Operators appropriate for a given field type. */
export function opsForType(type: string): { op: LogicOp; label: string }[] {
  let allowed: LogicOp[];
  if (NUMERIC_TYPES.has(type) || DATE_TYPES.has(type)) allowed = NUMERIC_OPS;
  else if (type === "multi_choice") allowed = MULTI_OPS;
  else if (type === "boolean") allowed = BOOL_OPS;
  else if (CHOICE_TYPES.has(type)) allowed = CHOICE_OPS;
  else allowed = TEXT_OPS;
  return _ALL.filter((o) => allowed.includes(o.op));
}

// --- parsing ---

const CONDITION_RE = /^([A-Za-z_]\w*)\s*(==|!=|>=|<=|>|<|=)\s*(.+)$/;
const NULL_EQ_RE = /^([A-Za-z_]\w*)\s*(==|!=)\s*None$/;
const SELECTED_RE = /^selected\(\s*([A-Za-z_]\w*)\s*,\s*(.+?)\s*\)$/;
const NOT_SELECTED_RE = /^not\s+selected\(\s*([A-Za-z_]\w*)\s*,\s*(.+?)\s*\)$/;

function parseCondition(src: string): LogicCondition | null {
  const trimmed = src.trim();

  // selected(field, value) → contains
  const sm = SELECTED_RE.exec(trimmed);
  if (sm) {
    const value = parseLiteral(sm[2].trim());
    if (value === undefined) return null;
    return { field: sm[1], op: "contains", value };
  }

  // not selected(field, value) → not_contains
  const nm = NOT_SELECTED_RE.exec(trimmed);
  if (nm) {
    const value = parseLiteral(nm[2].trim());
    if (value === undefined) return null;
    return { field: nm[1], op: "not_contains", value };
  }

  // field == None / field != None
  const nullm = NULL_EQ_RE.exec(trimmed);
  if (nullm) {
    return {
      field: nullm[1],
      op: nullm[2] === "==" ? "is_empty" : "is_answered",
      value: "",
    };
  }

  const m = CONDITION_RE.exec(trimmed);
  if (!m) return null;
  const value = parseLiteral(m[3].trim());
  if (value === undefined) return null;
  const op = (m[2] === "=" ? "==" : m[2]) as LogicOp;
  return { field: m[1], op, value };
}

function parseLiteral(src: string): string | number | boolean | undefined {
  if (/^(["']).*\1$/.test(src)) return src.slice(1, -1);
  if (src === "true" || src === "True") return true;
  if (src === "false" || src === "False") return false;
  if (/^-?\d+(\.\d+)?$/.test(src)) return Number(src);
  return undefined;
}

/**
 * Parse an expression into builder-editable structure.
 * Returns null for anything beyond `cond (and|or cond)*`.
 */
export function parseLogic(expression: string): ParsedLogic | null {
  const src = expression.trim();
  if (!src) return null;

  // Strip out selected()/not selected() and None checks before checking for
  // "forbidden" syntax — these are our own structured ops, not arbitrary parens/not.
  const stripped = src
    .replace(/\bnot\s+selected\([^)]*\)/g, "PLACEHOLDER")
    .replace(/\bselected\([^)]*\)/g, "PLACEHOLDER")
    .replace(/[A-Za-z_]\w*\s*(==|!=)\s*None/g, "PLACEHOLDER");

  if (/[()]/.test(stripped) || /\bnot\b/.test(stripped)) return null;

  const parts = src.split(/\s+(and|or)\s+/);
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

// --- serialization ---

function serializeLiteral(value: string | number | boolean): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

export function serializeLogic(logic: ParsedLogic): string {
  return logic.conditions.map((c) => serializeCondition(c)).join(` ${logic.connective} `);
}

function serializeCondition(c: LogicCondition): string {
  if (c.op === "is_answered") return `${c.field} != None`;
  if (c.op === "is_empty") return `${c.field} == None`;
  if (c.op === "contains") return `selected(${c.field}, ${serializeLiteral(c.value)})`;
  if (c.op === "not_contains") return `not selected(${c.field}, ${serializeLiteral(c.value)})`;
  return `${c.field} ${c.op} ${serializeLiteral(c.value)}`;
}

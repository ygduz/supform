import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import { useState } from "react";
import { allElements, isContainerType } from "./model";

const NUMERIC_TYPES = new Set(["number", "integer", "decimal", "rating", "scale", "calculated"]);
const NO_VALUE_TYPES = new Set(["note", "section", "html", "group", "repeat"]);

type ArithOp = "+" | "-" | "*" | "/";

interface FTerm {
  kind: "field" | "number";
  fieldName?: string;
  number?: string;
}

interface FormulaAst {
  terms: FTerm[];
  ops: ArithOp[];
}

const OP_LABELS: Record<ArithOp, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const OP_RE = /^[+\-*/]$/;

// ── Parser ────────────────────────────────────────────────────────────────────

function parseFormula(expr: string): FormulaAst | null {
  if (!expr.trim()) return { terms: [], ops: [] };
  // tokenize: numbers, identifiers, operators (skip whitespace)
  const tokens = expr.match(/\d+(?:\.\d+)?|[A-Za-z_]\w*|[+\-*/]/g);
  if (!tokens) return null;

  const terms: FTerm[] = [];
  const ops: ArithOp[] = [];
  let expectTerm = true;

  for (const tok of tokens) {
    if (expectTerm) {
      if (/^\d/.test(tok)) {
        terms.push({ kind: "number", number: tok });
      } else if (/^[A-Za-z_]/.test(tok)) {
        terms.push({ kind: "field", fieldName: tok });
      } else {
        return null; // unexpected operator
      }
      expectTerm = false;
    } else {
      if (!OP_RE.test(tok)) return null;
      ops.push(tok as ArithOp);
      expectTerm = true;
    }
  }
  if (expectTerm && terms.length > 0) return null; // trailing operator
  if (terms.length !== ops.length + 1) return null;
  return { terms, ops };
}

function serializeFormula(ast: FormulaAst): string {
  if (ast.terms.length === 0) return "";
  return ast.terms
    .map((t, i) => {
      const seg = t.kind === "field" ? (t.fieldName ?? "") : (t.number ?? "0");
      return i === 0 ? seg : ` ${ast.ops[i - 1]} ${seg}`;
    })
    .join("");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TermEditor({
  term,
  fields,
  onChange,
  onRemove,
}: {
  term: FTerm;
  fields: { name: string; label: string }[];
  onChange: (t: FTerm) => void;
  onRemove: () => void;
}) {
  return (
    <span className="fb-term">
      <select
        value={term.kind}
        onChange={(e) => {
          const kind = e.target.value as "field" | "number";
          onChange(
            kind === "field" ? { kind, fieldName: fields[0]?.name ?? "" } : { kind, number: "0" },
          );
        }}
      >
        <option value="field">field</option>
        <option value="number">number</option>
      </select>
      {term.kind === "field" ? (
        <select
          value={term.fieldName}
          onChange={(e) => onChange({ ...term, fieldName: e.target.value })}
        >
          {fields.map((f) => (
            <option key={f.name} value={f.name}>
              {f.label || f.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          step="any"
          value={term.number ?? "0"}
          onChange={(e) => onChange({ ...term, number: e.target.value })}
          className="fb-number"
        />
      )}
      <button type="button" className="fb-remove" title="Remove" onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

function OpSelect({ value, onChange }: { value: ArithOp; onChange: (op: ArithOp) => void }) {
  return (
    <select className="fb-op" value={value} onChange={(e) => onChange(e.target.value as ArithOp)}>
      {(Object.keys(OP_LABELS) as ArithOp[]).map((op) => (
        <option key={op} value={op}>
          {OP_LABELS[op]}
        </option>
      ))}
    </select>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FormulaBuilder({
  label,
  value,
  excludeName,
  onChange,
}: {
  label: string;
  value: string | undefined;
  excludeName: string;
  onChange: (v: string | undefined) => void;
}) {
  const schema = useBuilderStore((s) => s.schema);
  const [rawMode, setRawMode] = useState(false);

  const fields = allElements(schema).filter(
    (el) =>
      el.name !== excludeName &&
      !NO_VALUE_TYPES.has(el.type) &&
      !isContainerType(el.type) &&
      NUMERIC_TYPES.has(el.type),
  );

  const allFieldsForPick = allElements(schema).filter(
    (el) => el.name !== excludeName && !NO_VALUE_TYPES.has(el.type) && !isContainerType(el.type),
  );

  const fieldsMeta = (fields.length > 0 ? fields : allFieldsForPick).map((el) => ({
    name: el.name,
    label: localize(el.label) || el.name,
  }));

  const parsed = value ? parseFormula(value) : { terms: [], ops: [] };
  const advanced = rawMode || (value !== undefined && value !== "" && parsed === null);

  function commit(ast: FormulaAst) {
    const expr = serializeFormula(ast);
    onChange(expr || undefined);
  }

  function addTerm(ast: FormulaAst): FormulaAst {
    const newTerm: FTerm =
      fieldsMeta.length > 0
        ? { kind: "field", fieldName: fieldsMeta[0].name }
        : { kind: "number", number: "1" };
    return {
      terms: [...ast.terms, newTerm],
      ops: [...ast.ops, "+"],
    };
  }

  function removeTerm(ast: FormulaAst, i: number): FormulaAst {
    const terms = [...ast.terms];
    const ops = [...ast.ops];
    terms.splice(i, 1);
    if (i === 0 && ops.length > 0) ops.splice(0, 1);
    else if (ops.length > 0) ops.splice(i - 1, 1);
    return { terms, ops };
  }

  // ── Advanced (raw text) mode ──────────────────────────────────────────────

  if (advanced) {
    return (
      <div className="logic-rule">
        <div className="logic-head">
          <span>{label}</span>
          <button type="button" className="link-button" onClick={() => setRawMode(false)}>
            ← Visual
          </button>
        </div>
        <input
          className="logic-raw"
          type="text"
          value={value ?? ""}
          placeholder="e.g. price * qty + shipping"
          onChange={(e) => onChange(e.target.value || undefined)}
        />
        {value && (
          <button
            type="button"
            className="link-button fb-clear"
            onClick={() => {
              onChange(undefined);
              setRawMode(false);
            }}
          >
            Clear
          </button>
        )}
      </div>
    );
  }

  // ── Visual mode ──────────────────────────────────────────────────────────

  const ast = parsed ?? { terms: [], ops: [] };

  return (
    <div className="logic-rule">
      <div className="logic-head">
        <span>{label}</span>
        <button type="button" className="link-button" onClick={() => setRawMode(true)}>
          Advanced…
        </button>
      </div>

      {ast.terms.length === 0 ? (
        <p className="fb-empty">No formula yet.</p>
      ) : (
        <div className="fb-row">
          {ast.terms.map((term, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: formula terms have no stable ID
            <span key={`t${i}`} className="fb-segment">
              {i > 0 && (
                <OpSelect
                  value={ast.ops[i - 1]}
                  onChange={(op) => {
                    const newOps = [...ast.ops];
                    newOps[i - 1] = op;
                    commit({ ...ast, ops: newOps });
                  }}
                />
              )}
              <TermEditor
                term={term}
                fields={fieldsMeta}
                onChange={(t) => {
                  const terms = [...ast.terms];
                  terms[i] = t;
                  commit({ ...ast, terms });
                }}
                onRemove={() => commit(removeTerm(ast, i))}
              />
            </span>
          ))}
        </div>
      )}

      <button type="button" className="logic-add" onClick={() => commit(addTerm(ast))}>
        + Add term
      </button>

      {value && (
        <p className="fb-preview">
          <code>{value}</code>
        </p>
      )}
    </div>
  );
}

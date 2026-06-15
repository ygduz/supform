import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { useState } from "react";
import { type LogicCondition, NO_VALUE_OPS, opsForType, parseLogic, serializeLogic } from "./logic";
import { allElements, isContainerType } from "./model";

const NO_VALUE_TYPES = new Set(["note", "section", "html", "group", "repeat"]);
const NUMERIC_TYPES = new Set(["number", "integer", "decimal", "rating", "scale"]);

/**
 * Visual editor for one logic rule (visibleIf / requiredIf): condition rows of
 * [question] [operator] [value] joined by match-all/any, serialized to the expression
 * string the form engine evaluates. Expressions the simple builder can't represent
 * (parentheses, mixed and/or, calculations) open in a raw-text advanced editor instead.
 */
export function LogicBuilder({
  label,
  value,
  excludeName,
  onChange,
}: {
  label: string;
  value: string | undefined;
  /** The question being edited — excluded from the field dropdown (no self-reference). */
  excludeName: string;
  onChange: (v: string | undefined) => void;
}) {
  const schema = useBuilderStore((s) => s.schema);
  const parsed = value ? parseLogic(value) : { connective: "and" as const, conditions: [] };
  const [rawMode, setRawMode] = useState(false);
  const advanced = rawMode || (value !== undefined && value !== "" && parsed === null);

  const fields = allElements(schema).filter(
    (el) => el.name !== excludeName && !NO_VALUE_TYPES.has(el.type) && !isContainerType(el.type),
  );

  function commit(conditions: LogicCondition[], connective: "and" | "or") {
    onChange(conditions.length === 0 ? undefined : serializeLogic({ connective, conditions }));
  }

  if (advanced) {
    return (
      <div className="logic-rule">
        <div className="logic-head">
          <span>{label}</span>
          <button
            type="button"
            className="link-button"
            onClick={() => setRawMode(false)}
            disabled={value !== undefined && value !== "" && parseLogic(value ?? "") === null}
            title="The visual builder supports simple conditions joined by and/or"
          >
            Visual
          </button>
        </div>
        <input
          type="text"
          className="logic-input"
          value={value ?? ""}
          placeholder='e.g. age >= 18 and country == "TR"'
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      </div>
    );
  }

  const { connective, conditions } = parsed ?? { connective: "and" as const, conditions: [] };

  return (
    <div className="logic-rule">
      <div className="logic-head">
        <span>{label}</span>
        <button type="button" className="link-button" onClick={() => setRawMode(true)}>
          Advanced
        </button>
      </div>

      {conditions.length > 1 && (
        <label className="logic-conn">
          Match
          <select
            value={connective}
            onChange={(e) => commit(conditions, e.target.value as "and" | "or")}
          >
            <option value="and">all conditions</option>
            <option value="or">any condition</option>
          </select>
        </label>
      )}

      {conditions.map((cond, i) => (
        <ConditionRow
          // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no stable id
          key={i}
          cond={cond}
          fields={fields}
          onChange={(next) =>
            commit(
              conditions.map((c, j) => (j === i ? next : c)),
              connective,
            )
          }
          onRemove={() =>
            commit(
              conditions.filter((_, j) => j !== i),
              connective,
            )
          }
        />
      ))}

      <button
        type="button"
        className="link-button"
        disabled={fields.length === 0}
        title={fields.length === 0 ? "Add other questions first" : undefined}
        onClick={() => {
          const first = fields[0];
          const ops = opsForType(first.type);
          commit(
            [...conditions, { field: first.name, op: ops[0].op, value: defaultValueFor(first) }],
            connective,
          );
        }}
      >
        + Add condition
      </button>
    </div>
  );
}

function defaultValueFor(el: Element): string | number | boolean {
  if (el.options?.length) return el.options[0].value as string | number | boolean;
  if (el.type === "boolean") return true;
  if (NUMERIC_TYPES.has(el.type)) return 0;
  return "";
}

function ConditionRow({
  cond,
  fields,
  onChange,
  onRemove,
}: {
  cond: LogicCondition;
  fields: Element[];
  onChange: (c: LogicCondition) => void;
  onRemove: () => void;
}) {
  const target = fields.find((f) => f.name === cond.field);
  const ops = opsForType(target?.type ?? "text");
  const noValue = NO_VALUE_OPS.has(cond.op);

  function handleFieldChange(name: string) {
    const next = fields.find((f) => f.name === name);
    const nextOps = opsForType(next?.type ?? "text");
    const keepOp = nextOps.some((o) => o.op === cond.op) ? cond.op : nextOps[0].op;
    onChange({
      field: name,
      op: keepOp,
      value: next ? defaultValueFor(next) : cond.value,
    });
  }

  function handleOpChange(op: LogicCondition["op"]) {
    onChange({ ...cond, op });
  }

  return (
    <div className="logic-cond">
      <select
        aria-label="Question"
        value={cond.field}
        onChange={(e) => handleFieldChange(e.target.value)}
      >
        {!target && <option value={cond.field}>{cond.field}</option>}
        {fields.map((f) => (
          <option key={f.name} value={f.name}>
            {truncate(localize(f.label) || f.name)}
          </option>
        ))}
      </select>

      <select
        aria-label="Operator"
        value={cond.op}
        onChange={(e) => handleOpChange(e.target.value as LogicCondition["op"])}
      >
        {ops.map((o) => (
          <option key={o.op} value={o.op}>
            {o.label}
          </option>
        ))}
      </select>

      {!noValue && <ValueInput cond={cond} target={target} onChange={onChange} />}

      <button type="button" title="Remove condition" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

function ValueInput({
  cond,
  target,
  onChange,
}: {
  cond: LogicCondition;
  target: Element | undefined;
  onChange: (c: LogicCondition) => void;
}) {
  // contains/not_contains or choice == : pick from the field's options.
  if (target?.options?.length) {
    const known = target.options.some((o) => o.value === cond.value);
    return (
      <select
        aria-label="Value"
        value={String(cond.value)}
        onChange={(e) => {
          const opt = target.options?.find((o) => String(o.value) === e.target.value);
          onChange({ ...cond, value: (opt?.value ?? e.target.value) as string | number | boolean });
        }}
      >
        {!known && <option value={String(cond.value)}>{String(cond.value)}</option>}
        {target.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {truncate(localize(o.label) || String(o.value))}
          </option>
        ))}
      </select>
    );
  }

  if (target?.type === "boolean") {
    return (
      <select
        aria-label="Value"
        value={String(cond.value === true)}
        onChange={(e) => onChange({ ...cond, value: e.target.value === "true" })}
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  if (target && NUMERIC_TYPES.has(target.type)) {
    return (
      <input
        aria-label="Value"
        type="number"
        value={typeof cond.value === "number" ? cond.value : ""}
        onChange={(e) =>
          onChange({ ...cond, value: e.target.value === "" ? 0 : Number(e.target.value) })
        }
      />
    );
  }

  return (
    <input
      aria-label="Value"
      type="text"
      value={String(cond.value)}
      onChange={(e) => onChange({ ...cond, value: e.target.value })}
    />
  );
}

const truncate = (s: string) => (s.length > 38 ? `${s.slice(0, 36)}…` : s);

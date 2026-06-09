import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Choice, Element, Validation } from "@/types/form-schema";
import { hasOptionList } from "./model";

const PRESENTATIONAL = new Set(["note", "section", "html"]);
const NUMERIC = new Set(["number", "integer", "decimal"]);
const TEXTUAL = new Set(["text", "longtext", "email"]);

/** Right-hand inspector for editing the currently-selected question. */
export function PropertiesPanel({ element }: { element: Element }) {
  const store = useBuilderStore();
  const { update } = store;
  const name = element.name;
  const type = element.type;

  const canRequire =
    !PRESENTATIONAL.has(type) && type !== "group" && type !== "repeat" && type !== "calculated";

  const setValidation = (patch: Partial<Validation>) =>
    update(name, { validation: { ...(element.validation ?? {}), ...patch } });

  return (
    <div className="props">
      <h3>Question settings</h3>

      <TextProp
        label="Label"
        value={localize(element.label)}
        onChange={(v) => update(name, { label: v })}
      />
      <TextProp
        label="Help text"
        value={localize(element.hint)}
        placeholder="Optional guidance shown under the question"
        onChange={(v) => update(name, { hint: v || undefined })}
      />

      {TEXTUAL.has(type) && (
        <TextProp
          label="Placeholder"
          value={localize(element.placeholder)}
          onChange={(v) => update(name, { placeholder: v || undefined })}
        />
      )}

      {canRequire && (
        <label className="prop prop-check">
          <input
            type="checkbox"
            checked={Boolean(element.required)}
            onChange={(e) => update(name, { required: e.target.checked })}
          />
          <span>Required</span>
        </label>
      )}

      {hasOptionList(type) && (
        <ListEditor
          title="Options"
          items={element.options ?? []}
          onAdd={() => store.addOption(name)}
          onUpdate={(i, label) => store.updateOption(name, i, choiceFrom(label))}
          onRemove={(i) => store.removeOption(name, i)}
        />
      )}

      {type === "matrix" && (
        <>
          <ListEditor
            title="Rows"
            items={element.rows ?? []}
            onAdd={() => store.addRow(name)}
            onUpdate={(i, label) => store.updateRow(name, i, choiceFrom(label))}
            onRemove={(i) => store.removeRow(name, i)}
          />
          <ListEditor
            title="Columns"
            items={element.columns ?? []}
            onAdd={() => store.addColumn(name)}
            onUpdate={(i, label) => store.updateColumn(name, i, choiceFrom(label))}
            onRemove={(i) => store.removeColumn(name, i)}
          />
        </>
      )}

      {type === "repeat" && (
        <div className="prop-group">
          <NumberProp
            label="Min entries"
            value={element.repeat?.min}
            onChange={(v) => update(name, { repeat: { ...element.repeat, min: v ?? 0 } })}
          />
          <NumberProp
            label="Max entries"
            value={element.repeat?.max}
            onChange={(v) =>
              update(name, { repeat: { ...element.repeat, min: element.repeat?.min ?? 0, max: v } })
            }
          />
        </div>
      )}

      {/* Validation rules */}
      {(NUMERIC.has(type) || TEXTUAL.has(type) || type === "multi_choice") && (
        <fieldset className="prop-fieldset">
          <legend>Validation</legend>
          {NUMERIC.has(type) && (
            <div className="prop-group">
              <NumberProp
                label="Minimum"
                value={element.validation?.min}
                onChange={(v) => setValidation({ min: v })}
              />
              <NumberProp
                label="Maximum"
                value={element.validation?.max}
                onChange={(v) => setValidation({ max: v })}
              />
            </div>
          )}
          {TEXTUAL.has(type) && (
            <>
              <div className="prop-group">
                <NumberProp
                  label="Min length"
                  value={element.validation?.minLength}
                  onChange={(v) => setValidation({ minLength: v })}
                />
                <NumberProp
                  label="Max length"
                  value={element.validation?.maxLength}
                  onChange={(v) => setValidation({ maxLength: v })}
                />
              </div>
              <TextProp
                label="Pattern (regex)"
                value={element.validation?.pattern ?? ""}
                onChange={(v) => setValidation({ pattern: v || undefined })}
              />
            </>
          )}
          {type === "multi_choice" && (
            <div className="prop-group">
              <NumberProp
                label="Min selected"
                value={element.validation?.minSelected}
                onChange={(v) => setValidation({ minSelected: v })}
              />
              <NumberProp
                label="Max selected"
                value={element.validation?.maxSelected}
                onChange={(v) => setValidation({ maxSelected: v })}
              />
            </div>
          )}
          <TextProp
            label="Error message"
            value={localize(element.validation?.message)}
            placeholder="Shown when this field fails validation"
            onChange={(v) => setValidation({ message: v || undefined })}
          />
        </fieldset>
      )}

      {/* Logic */}
      <fieldset className="prop-fieldset">
        <legend>Logic</legend>
        <LogicProp
          label="Show this question only if…"
          value={element.visibleIf}
          placeholder="e.g. age >= 18"
          onChange={(v) => update(name, { visibleIf: v })}
        />
        {canRequire && (
          <LogicProp
            label="Required only if…"
            value={element.requiredIf}
            placeholder="e.g. has_account == true"
            onChange={(v) => update(name, { requiredIf: v })}
          />
        )}
        {type === "calculated" && (
          <LogicProp
            label="Calculate value"
            value={element.calculate}
            placeholder="e.g. price * quantity"
            onChange={(v) => update(name, { calculate: v })}
          />
        )}
      </fieldset>
    </div>
  );
}

/** Derive a stable option/row/column value from its edited label. */
function choiceFrom(label: string): Partial<Choice> {
  return { label, value: label.toLowerCase().replace(/\s+/g, "_") };
}

function TextProp(props: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="prop">
      <span>{props.label}</span>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

function NumberProp(props: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="prop">
      <span>{props.label}</span>
      <input
        type="number"
        value={props.value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          props.onChange(raw === "" ? undefined : Number(raw));
        }}
      />
    </label>
  );
}

function LogicProp(props: {
  label: string;
  value: string | undefined;
  placeholder?: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <label className="prop">
      <span>{props.label}</span>
      <input
        type="text"
        className="logic-input"
        value={props.value ?? ""}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value || undefined)}
      />
    </label>
  );
}

function ListEditor(props: {
  title: string;
  items: Choice[];
  onAdd: () => void;
  onUpdate: (index: number, label: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="prop">
      <span>{props.title}</span>
      {props.items.map((item, i) => (
        <div className="option-row" key={`${props.title}-${String(item.value)}-${i}`}>
          <input
            type="text"
            value={localize(item.label) || String(item.value)}
            onChange={(e) => props.onUpdate(i, e.target.value)}
          />
          <button type="button" title="Remove" onClick={() => props.onRemove(i)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="link-button" onClick={props.onAdd}>
        + Add {props.title.replace(/s$/, "").toLowerCase()}
      </button>
    </div>
  );
}

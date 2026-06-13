import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Choice, Element, I18nString, Validation } from "@/types/form-schema";
import { LogicBuilder } from "./LogicBuilder";
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
  const languages = store.schema.languages ?? [];
  const defaultLang = store.schema.defaultLanguage ?? "en";

  const canRequire =
    !PRESENTATIONAL.has(type) && type !== "group" && type !== "repeat" && type !== "calculated";

  const setValidation = (patch: Partial<Validation>) =>
    update(name, { validation: { ...(element.validation ?? {}), ...patch } });

  return (
    <div className="props">
      <h3>Question settings</h3>

      <I18nProp
        label="Label"
        value={element.label}
        languages={languages}
        defaultLang={defaultLang}
        onChange={(v) => update(name, { label: v })}
      />
      <I18nProp
        label="Help text"
        value={element.hint}
        languages={languages}
        defaultLang={defaultLang}
        placeholder="Optional guidance shown under the question"
        onChange={(v) => update(name, { hint: v })}
      />

      {TEXTUAL.has(type) && (
        <I18nProp
          label="Placeholder"
          value={element.placeholder}
          languages={languages}
          defaultLang={defaultLang}
          onChange={(v) => update(name, { placeholder: v })}
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
          onScore={
            store.schema.settings?.quizMode
              ? (i, score) => store.updateOption(name, i, { score })
              : undefined
          }
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
        <LogicBuilder
          label="Show this question only if…"
          value={element.visibleIf}
          excludeName={name}
          onChange={(v) => update(name, { visibleIf: v })}
        />
        {canRequire && (
          <LogicBuilder
            label="Required only if…"
            value={element.requiredIf}
            excludeName={name}
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

/** Read one language's text out of an i18n value (empty if not yet translated). */
function translationFor(value: I18nString | undefined, lang: string, defaultLang: string): string {
  if (value == null) return "";
  if (typeof value === "string") return lang === defaultLang ? value : "";
  return value[lang] ?? "";
}

/** Set one language's text, normalizing to a plain string when only the default is used. */
function withTranslation(
  value: I18nString | undefined,
  lang: string,
  text: string,
  defaultLang: string,
): I18nString | undefined {
  const obj: Record<string, string> =
    typeof value === "object" && value !== null
      ? { ...value }
      : typeof value === "string" && value
        ? { [defaultLang]: value }
        : {};
  if (text) obj[lang] = text;
  else delete obj[lang];
  const keys = Object.keys(obj);
  if (keys.length === 0) return undefined;
  // Collapse a single default-only translation back to a plain string.
  if (keys.length === 1 && keys[0] === defaultLang) return obj[defaultLang];
  return obj;
}

/**
 * Editor for a translatable string. With one (or no) language it's a plain text input;
 * with several it shows one input per language so authors can translate in place.
 */
function I18nProp(props: {
  label: string;
  value: I18nString | undefined;
  languages: string[];
  defaultLang: string;
  placeholder?: string;
  onChange: (v: I18nString | undefined) => void;
}) {
  if (props.languages.length <= 1) {
    return (
      <TextProp
        label={props.label}
        value={localize(props.value, props.defaultLang)}
        placeholder={props.placeholder}
        onChange={(v) => props.onChange(v || undefined)}
      />
    );
  }
  return (
    <div className="prop">
      <span>{props.label}</span>
      {props.languages.map((code) => (
        <div className="i18n-row" key={code}>
          <span className="i18n-code">{code}</span>
          <input
            type="text"
            value={translationFor(props.value, code, props.defaultLang)}
            placeholder={props.placeholder}
            onChange={(e) =>
              props.onChange(withTranslation(props.value, code, e.target.value, props.defaultLang))
            }
          />
        </div>
      ))}
    </div>
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
  /** When set, show a per-option score input (quiz mode). */
  onScore?: (index: number, score: number | undefined) => void;
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
          {props.onScore && (
            <input
              type="number"
              className="option-score"
              title="Score"
              value={item.score ?? ""}
              placeholder="pts"
              onChange={(e) =>
                props.onScore?.(i, e.target.value === "" ? undefined : Number(e.target.value))
              }
            />
          )}
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

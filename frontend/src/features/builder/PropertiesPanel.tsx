import { Button, Input } from "@/components";
import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Choice, Element, I18nString, Validation } from "@/types/form-schema";
import { FormulaBuilder } from "./FormulaBuilder";
import { LogicBuilder } from "./LogicBuilder";
import { fieldMeta } from "./fieldMeta";
import { hasOptionList, isContainerType, isPresentationalType } from "./model";

// Local to this panel — drives which validation inputs (min/max) render. Narrower than
// isNumericType: rating/scale have no meaningful min/max validation UI.
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

  const canRequire = !isPresentationalType(type) && !isContainerType(type) && type !== "calculated";
  const quizMode = Boolean(store.schema.settings?.quizMode);
  // Questions that can carry a correct answer / points when quiz mode is on.
  const gradable = quizMode && canRequire;

  const setValidation = (patch: Partial<Validation>) =>
    update(name, { validation: { ...(element.validation ?? {}), ...patch } });

  const meta = fieldMeta(type);

  return (
    <div className="props">
      <header className="props-header">
        <span className="props-icon" aria-hidden="true">
          {meta.icon}
        </span>
        <div className="props-titles">
          <span className="props-type">{meta.label}</span>
          <code className="props-key" title="Field key (used in exports & logic)">
            {name}
          </code>
        </div>
      </header>

      <fieldset className="prop-fieldset">
        <legend>Basics</legend>
        <I18nProp
          label="Label"
          value={element.label}
          languages={languages}
          defaultLang={defaultLang}
          onChange={(v) => update(name, { label: v })}
        />
        <p className="prop-caption">
          Tip: insert a previous answer with <code>{"{field_key}"}</code> — e.g.{" "}
          <code>{"Hi {first_name}!"}</code>
        </p>
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
      </fieldset>

      {hasOptionList(type) && (
        <fieldset className="prop-fieldset">
          <legend>Choices</legend>
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
            onCorrect={
              store.schema.settings?.quizMode
                ? (i, correct) => store.updateOption(name, i, { correct: correct || undefined })
                : undefined
            }
          />
          {store.schema.settings?.quizMode && (
            <p className="prop-caption">✓ marks a correct answer · pts = score for choosing it</p>
          )}
        </fieldset>
      )}

      {type === "matrix" && (
        <fieldset className="prop-fieldset">
          <legend>Matrix</legend>
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
        </fieldset>
      )}

      {type === "repeat" && (
        <fieldset className="prop-fieldset">
          <legend>Repeat</legend>
          <div className="prop-label">
            <Input
              label="Entry label"
              type="text"
              placeholder="e.g. Member, Asset, Incident"
              value={
                typeof element.repeat?.entryLabel === "string"
                  ? element.repeat.entryLabel
                  : ((element.repeat?.entryLabel as Record<string, string> | undefined)?.en ?? "")
              }
              onChange={(e) =>
                update(name, { repeat: { ...element.repeat, entryLabel: e.target.value } })
              }
            />
          </div>
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
                update(name, {
                  repeat: { ...element.repeat, min: element.repeat?.min ?? 0, max: v },
                })
              }
            />
          </div>
          <div className="prop-label">
            <Input
              label='"Add" button text'
              type="text"
              placeholder="e.g. Add another member"
              value={
                typeof element.repeat?.addButtonText === "string"
                  ? element.repeat.addButtonText
                  : ((element.repeat?.addButtonText as Record<string, string> | undefined)?.en ??
                    "")
              }
              onChange={(e) =>
                update(name, {
                  repeat: { ...element.repeat, addButtonText: e.target.value },
                })
              }
            />
          </div>
        </fieldset>
      )}

      {/* Quiz grading (quiz mode only) */}
      {gradable && (
        <fieldset className="prop-fieldset">
          <legend>Quiz</legend>
          {hasOptionList(type) ? (
            <p className="prop-caption">Mark the correct option(s) with ✓ in Choices above.</p>
          ) : NUMERIC.has(type) ? (
            <NumberProp
              label="Correct answer"
              value={typeof element.correctAnswer === "number" ? element.correctAnswer : undefined}
              onChange={(v) => update(name, { correctAnswer: v })}
            />
          ) : type === "boolean" ? (
            <div className="prop">
              <span>Correct answer</span>
              <select
                className="select"
                value={
                  typeof element.correctAnswer === "boolean" ? String(element.correctAnswer) : ""
                }
                onChange={(e) =>
                  update(name, {
                    correctAnswer: e.target.value === "" ? undefined : e.target.value === "true",
                  })
                }
              >
                <option value="">— not graded —</option>
                <option value="true">Yes / True</option>
                <option value="false">No / False</option>
              </select>
            </div>
          ) : (
            <TextProp
              label="Correct answer"
              value={typeof element.correctAnswer === "string" ? element.correctAnswer : ""}
              placeholder="Exact expected answer (case-insensitive)"
              onChange={(v) => update(name, { correctAnswer: v || undefined })}
            />
          )}
          <NumberProp
            label="Points"
            value={element.points}
            onChange={(v) => update(name, { points: v })}
          />
          <I18nProp
            label="Feedback if correct"
            value={element.feedback?.correct}
            languages={languages}
            defaultLang={defaultLang}
            placeholder="Shown on the results screen"
            onChange={(v) =>
              update(name, { feedback: pruneFeedback({ ...element.feedback, correct: v }) })
            }
          />
          <I18nProp
            label="Feedback if incorrect"
            value={element.feedback?.incorrect}
            languages={languages}
            defaultLang={defaultLang}
            placeholder="Shown on the results screen"
            onChange={(v) =>
              update(name, { feedback: pruneFeedback({ ...element.feedback, incorrect: v }) })
            }
          />
        </fieldset>
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
          <FormulaBuilder
            label="Calculate value"
            value={element.calculate}
            excludeName={name}
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

/** Drop an all-empty feedback object so it isn't persisted as `{}`. */
function pruneFeedback(f: {
  correct?: I18nString;
  incorrect?: I18nString;
}): { correct?: I18nString; incorrect?: I18nString } | undefined {
  return f.correct || f.incorrect ? f : undefined;
}

function TextProp(props: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="prop">
      <Input
        label={props.label}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
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
    <div className="prop">
      <Input
        label={props.label}
        type="number"
        value={props.value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          props.onChange(raw === "" ? undefined : Number(raw));
        }}
      />
    </div>
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
  /** When set, show a per-option "correct answer" checkbox (quiz mode grading). */
  onCorrect?: (index: number, correct: boolean) => void;
}) {
  return (
    <div className="prop">
      <span>{props.title}</span>
      {props.items.map((item, i) => (
        <div className="option-row" key={`${props.title}-${String(item.value)}-${i}`}>
          {props.onCorrect && (
            <label className="option-correct" title="Mark as a correct answer">
              <input
                type="checkbox"
                checked={item.correct === true}
                onChange={(e) => props.onCorrect?.(i, e.target.checked)}
                aria-label="Correct answer"
              />
            </label>
          )}
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
          <Button variant="ghost" size="sm" title="Remove" onClick={() => props.onRemove(i)}>
            ✕
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={props.onAdd}>
        + Add {props.title.replace(/s$/, "").toLowerCase()}
      </Button>
    </div>
  );
}

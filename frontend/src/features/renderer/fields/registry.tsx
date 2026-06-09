/**
 * Question-type registry: maps an element `type` to the widget that renders it.
 *
 * This is the extension point that makes Supform "more flexible than KOBO": adding a new
 * question type is just registering a renderer here (and a Pydantic counterpart server-side).
 */
import { localize } from "@/lib/i18n";
import type { Choice, Element } from "@/types/form-schema";

type FieldProps = {
  element: Element;
  value: unknown;
  onChange: (value: unknown) => void;
};

type Renderer = (p: FieldProps) => JSX.Element;

/** Resolve a choice's display label, falling back to its raw value. */
const choiceLabel = (opt: Choice): string => localize(opt.label) || String(opt.value);

const TextField: Renderer = ({ element, value, onChange }) => (
  <input
    id={element.name}
    type={element.type === "email" ? "email" : "text"}
    placeholder={localize(element.placeholder)}
    value={(value as string) ?? ""}
    onChange={(e) => onChange(e.target.value)}
  />
);

const LongText: Renderer = ({ element, value, onChange }) => (
  <textarea
    id={element.name}
    placeholder={localize(element.placeholder)}
    value={(value as string) ?? ""}
    onChange={(e) => onChange(e.target.value)}
  />
);

const NumberField: Renderer = ({ element, value, onChange }) => (
  <input
    id={element.name}
    type="number"
    step={element.type === "integer" ? "1" : "any"}
    min={element.validation?.min}
    max={element.validation?.max}
    placeholder={localize(element.placeholder)}
    value={typeof value === "number" ? value : ""}
    onChange={(e) => {
      const raw = e.target.value;
      if (raw === "") return onChange(undefined);
      const parsed = element.type === "integer" ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
      onChange(Number.isNaN(parsed) ? undefined : parsed);
    }}
  />
);

const DateTimeField =
  (inputType: "date" | "time" | "datetime-local"): Renderer =>
  ({ element, value, onChange }) => (
    <input
      id={element.name}
      type={inputType}
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  );

const SingleChoice: Renderer = ({ element, value, onChange }) => (
  <div className="choices">
    {(element.options ?? []).map((opt) => (
      <label key={String(opt.value)}>
        <input
          type="radio"
          name={element.name}
          checked={value === opt.value}
          onChange={() => onChange(opt.value)}
        />
        {choiceLabel(opt)}
      </label>
    ))}
  </div>
);

const MultiChoice: Renderer = ({ element, value, onChange }) => {
  const selected = Array.isArray(value) ? (value as Array<string | number | boolean>) : [];
  const toggle = (optValue: string | number | boolean) =>
    onChange(
      selected.includes(optValue)
        ? selected.filter((v) => v !== optValue)
        : [...selected, optValue],
    );
  return (
    <div className="choices">
      {(element.options ?? []).map((opt) => (
        <label key={String(opt.value)}>
          <input
            type="checkbox"
            name={element.name}
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
          />
          {choiceLabel(opt)}
        </label>
      ))}
    </div>
  );
};

const Dropdown: Renderer = ({ element, value, onChange }) => {
  const options = element.options ?? [];
  return (
    <select
      id={element.name}
      className="select"
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(e) => {
        const picked = options.find((opt) => String(opt.value) === e.target.value);
        onChange(picked ? picked.value : undefined);
      }}
    >
      <option value="">{localize(element.placeholder) || "Select…"}</option>
      {options.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)}>
          {choiceLabel(opt)}
        </option>
      ))}
    </select>
  );
};

const BooleanField: Renderer = ({ element, value, onChange }) => (
  <fieldset className="toggle" aria-label={localize(element.label) || element.name}>
    <button
      type="button"
      className={value === true ? "toggle-btn active" : "toggle-btn"}
      aria-pressed={value === true}
      onClick={() => onChange(true)}
    >
      Yes
    </button>
    <button
      type="button"
      className={value === false ? "toggle-btn active" : "toggle-btn"}
      aria-pressed={value === false}
      onClick={() => onChange(false)}
    >
      No
    </button>
  </fieldset>
);

const Scale: Renderer = ({ element, value, onChange }) => (
  <div className="scale">
    {(element.options ?? []).map((opt) => (
      <button
        type="button"
        key={String(opt.value)}
        className={value === opt.value ? "scale-btn active" : "scale-btn"}
        aria-pressed={value === opt.value}
        onClick={() => onChange(opt.value)}
      >
        {choiceLabel(opt)}
      </button>
    ))}
  </div>
);

const Rating: Renderer = ({ element, value, onChange }) => (
  <div className="rating">
    {(element.options ?? []).map((opt) => (
      <button
        type="button"
        key={String(opt.value)}
        className={value === opt.value ? "star active" : "star"}
        onClick={() => onChange(opt.value)}
      >
        ★
      </button>
    ))}
  </div>
);

const Matrix: Renderer = ({ element, value, onChange }) => {
  const rows = element.rows ?? [];
  const columns = element.columns ?? [];
  const answers = (value ?? {}) as Record<string, string | number | boolean>;
  const setCell = (rowValue: string, columnValue: string | number | boolean) =>
    onChange({ ...answers, [rowValue]: columnValue });
  return (
    <table className="matrix">
      <thead>
        <tr>
          <td />
          {columns.map((col) => (
            <th key={String(col.value)} scope="col">
              {choiceLabel(col)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const rowKey = String(row.value);
          return (
            <tr key={rowKey}>
              <th scope="row">{choiceLabel(row)}</th>
              {columns.map((col) => (
                <td key={String(col.value)}>
                  <input
                    type="radio"
                    name={`${element.name}.${rowKey}`}
                    aria-label={`${choiceLabel(row)} – ${choiceLabel(col)}`}
                    checked={answers[rowKey] === col.value}
                    onChange={() => setCell(rowKey, col.value)}
                  />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

/** type -> renderer. Unknown types fall back to a text input. */
const REGISTRY: Record<string, Renderer> = {
  text: TextField,
  email: TextField,
  longtext: LongText,
  number: NumberField,
  integer: NumberField,
  decimal: NumberField,
  date: DateTimeField("date"),
  time: DateTimeField("time"),
  datetime: DateTimeField("datetime-local"),
  single_choice: SingleChoice,
  multi_choice: MultiChoice,
  dropdown: Dropdown,
  boolean: BooleanField,
  scale: Scale,
  rating: Rating,
  matrix: Matrix,
  // TODO(M2): ranking, repeat, file, geopoint, signature, …
};

export function renderField(element: Element, value: unknown, onChange: (v: unknown) => void) {
  const Field = REGISTRY[element.type] ?? TextField;
  return <Field element={element} value={value} onChange={onChange} />;
}

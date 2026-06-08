/**
 * Question-type registry: maps an element `type` to the widget that renders it.
 *
 * This is the extension point that makes Supform "more flexible than KOBO": adding a new
 * question type is just registering a renderer here (and a Pydantic counterpart server-side).
 */
import { localize } from "@/lib/i18n";
import type { Element } from "@/types/form-schema";

type FieldProps = {
  element: Element;
  value: unknown;
  onChange: (value: unknown) => void;
};

type Renderer = (p: FieldProps) => JSX.Element;

const TextField: Renderer = ({ element, value, onChange }) => (
  <input
    id={element.name}
    type={element.type === "email" ? "email" : element.type === "number" ? "number" : "text"}
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
        {localize(opt.label) || String(opt.value)}
      </label>
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

/** type -> renderer. Unknown types fall back to a text input. */
const REGISTRY: Record<string, Renderer> = {
  text: TextField,
  email: TextField,
  number: TextField,
  integer: TextField,
  decimal: TextField,
  longtext: LongText,
  single_choice: SingleChoice,
  dropdown: SingleChoice,
  rating: Rating,
  // TODO(M2): multi_choice, date, matrix, repeat, file, geopoint, signature, …
};

export function renderField(element: Element, value: unknown, onChange: (v: unknown) => void) {
  const Field = REGISTRY[element.type] ?? TextField;
  return <Field element={element} value={value} onChange={onChange} />;
}

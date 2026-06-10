/**
 * Question-type registry: maps an element `type` to the widget that renders it.
 *
 * This is the extension point that makes Supform "more flexible than KOBO": adding a new
 * question type is just registering a renderer here (and a Pydantic counterpart server-side).
 */
import { type MediaRef, api } from "@/api/client";
import { LanguageContext, localize } from "@/lib/i18n";
import type { Choice, Element } from "@/types/form-schema";
import { useContext, useState } from "react";
import { evaluateBool } from "../expressions";

type FieldProps = {
  element: Element;
  value: unknown;
  onChange: (value: unknown) => void;
  /** The published form id, needed by fields that call the API (e.g. file upload). */
  formId?: string;
  /** Current answers in scope, so options can be filtered by their `visibleIf` (cascading). */
  scope?: Record<string, unknown>;
};

type Renderer = (p: FieldProps) => JSX.Element;

/** Resolve a choice's display label in a language, falling back to its raw value. */
const choiceLabel = (opt: Choice, lang: string): string =>
  localize(opt.label, lang) || String(opt.value);

/** Options visible given the current answers — drives cascading / dependent selects. */
const visibleChoices = (options: Choice[], scope: Record<string, unknown> = {}): Choice[] =>
  options.filter((opt) => evaluateBool(opt.visibleIf, scope));

const TextField: Renderer = ({ element, value, onChange }) => {
  const lang = useContext(LanguageContext);
  return (
    <input
      id={element.name}
      type={element.type === "email" ? "email" : "text"}
      placeholder={localize(element.placeholder, lang)}
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};

const LongText: Renderer = ({ element, value, onChange }) => {
  const lang = useContext(LanguageContext);
  return (
    <textarea
      id={element.name}
      placeholder={localize(element.placeholder, lang)}
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};

const NumberField: Renderer = ({ element, value, onChange }) => {
  const lang = useContext(LanguageContext);
  return (
    <input
      id={element.name}
      type="number"
      step={element.type === "integer" ? "1" : "any"}
      min={element.validation?.min}
      max={element.validation?.max}
      placeholder={localize(element.placeholder, lang)}
      value={typeof value === "number" ? value : ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(undefined);
        const parsed =
          element.type === "integer" ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
        onChange(Number.isNaN(parsed) ? undefined : parsed);
      }}
    />
  );
};

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

const SingleChoice: Renderer = ({ element, value, onChange, scope }) => {
  const lang = useContext(LanguageContext);
  return (
    <div className="choices">
      {visibleChoices(element.options ?? [], scope).map((opt) => (
        <label key={String(opt.value)}>
          <input
            type="radio"
            name={element.name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {choiceLabel(opt, lang)}
        </label>
      ))}
    </div>
  );
};

const MultiChoice: Renderer = ({ element, value, onChange, scope }) => {
  const lang = useContext(LanguageContext);
  const selected = Array.isArray(value) ? (value as Array<string | number | boolean>) : [];
  const toggle = (optValue: string | number | boolean) =>
    onChange(
      selected.includes(optValue)
        ? selected.filter((v) => v !== optValue)
        : [...selected, optValue],
    );
  return (
    <div className="choices">
      {visibleChoices(element.options ?? [], scope).map((opt) => (
        <label key={String(opt.value)}>
          <input
            type="checkbox"
            name={element.name}
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
          />
          {choiceLabel(opt, lang)}
        </label>
      ))}
    </div>
  );
};

const Dropdown: Renderer = ({ element, value, onChange, scope }) => {
  const lang = useContext(LanguageContext);
  const options = visibleChoices(element.options ?? [], scope);
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
      <option value="">{localize(element.placeholder, lang) || "Select…"}</option>
      {options.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)}>
          {choiceLabel(opt, lang)}
        </option>
      ))}
    </select>
  );
};

const BooleanField: Renderer = ({ element, value, onChange }) => {
  const lang = useContext(LanguageContext);
  return (
    <fieldset className="toggle" aria-label={localize(element.label, lang) || element.name}>
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
};

const Scale: Renderer = ({ element, value, onChange }) => {
  const lang = useContext(LanguageContext);
  return (
    <div className="scale">
      {(element.options ?? []).map((opt) => (
        <button
          type="button"
          key={String(opt.value)}
          className={value === opt.value ? "scale-btn active" : "scale-btn"}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {choiceLabel(opt, lang)}
        </button>
      ))}
    </div>
  );
};

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
  const lang = useContext(LanguageContext);
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
              {choiceLabel(col, lang)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const rowKey = String(row.value);
          return (
            <tr key={rowKey}>
              <th scope="row">{choiceLabel(row, lang)}</th>
              {columns.map((col) => (
                <td key={String(col.value)}>
                  <input
                    type="radio"
                    name={`${element.name}.${rowKey}`}
                    aria-label={`${choiceLabel(row, lang)} – ${choiceLabel(col, lang)}`}
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

const FileField: Renderer = ({ element, value, onChange, formId }) => {
  const ref = value as MediaRef | undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Uploads need a real published form; the builder preview/demo can't persist files.
  const canUpload = Boolean(formId) && formId !== "preview" && formId !== "demo";

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !formId) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await api.uploadFile(formId, file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (ref) {
    return (
      <div className="file-field">
        <span className="file-name">📎 {ref.filename}</span>
        <button type="button" className="link-button" onClick={() => onChange(undefined)}>
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="file-field">
      <input
        id={element.name}
        type="file"
        accept={element.type === "image" ? "image/*" : undefined}
        disabled={!canUpload || busy}
        onChange={onSelect}
      />
      {busy && <small className="hint">Uploading…</small>}
      {!canUpload && <small className="hint">File upload is available on the live form.</small>}
      {error && <small className="error">{error}</small>}
    </div>
  );
};

interface GeoValue {
  lat: number;
  lng: number;
  accuracy?: number;
}

const Geopoint: Renderer = ({ value, onChange }) => {
  const point = (value ?? null) as GeoValue | null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function locate() {
    if (!navigator.geolocation) {
      setError("Geolocation isn't available in this browser.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
        });
        setBusy(false);
      },
      (err) => {
        setError(err.message || "Couldn't get your location.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const setCoord = (key: "lat" | "lng", raw: string) => {
    const n = raw === "" ? undefined : Number(raw);
    const base: GeoValue = point ?? { lat: 0, lng: 0 };
    if (n === undefined || Number.isNaN(n)) {
      onChange(key === "lat" ? { ...base, lat: 0 } : { ...base, lng: 0 });
      return;
    }
    onChange({ ...base, [key]: n });
  };

  return (
    <div className="geopoint-field">
      <button type="button" className="button secondary" onClick={locate} disabled={busy}>
        {busy ? "Locating…" : "📍 Use my location"}
      </button>
      <div className="geopoint-coords">
        <label>
          Lat
          <input
            type="number"
            step="any"
            value={point ? point.lat : ""}
            onChange={(e) => setCoord("lat", e.target.value)}
          />
        </label>
        <label>
          Lng
          <input
            type="number"
            step="any"
            value={point ? point.lng : ""}
            onChange={(e) => setCoord("lng", e.target.value)}
          />
        </label>
      </div>
      {point?.accuracy != null && <small className="hint">±{point.accuracy} m</small>}
      {error && <small className="error">{error}</small>}
    </div>
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
  file: FileField,
  image: FileField,
  geopoint: Geopoint,
  // TODO(M2): ranking, signature, …
};

export function renderField(
  element: Element,
  value: unknown,
  onChange: (v: unknown) => void,
  formId?: string,
  scope?: Record<string, unknown>,
) {
  const Field = REGISTRY[element.type] ?? TextField;
  return (
    <Field element={element} value={value} onChange={onChange} formId={formId} scope={scope} />
  );
}

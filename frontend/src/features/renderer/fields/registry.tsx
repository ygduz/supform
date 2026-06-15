/**
 * Question-type registry: maps an element `type` to the widget that renders it.
 *
 * This is the extension point that makes Supform "more flexible than KOBO": adding a new
 * question type is just registering a renderer here (and a Pydantic counterpart server-side).
 */
import { type MediaRef, api } from "@/api/client";
import { LanguageContext, localize } from "@/lib/i18n";
import type { Choice, Element } from "@/types/form-schema";
import { useContext, useEffect, useRef, useState } from "react";
import { evaluateBool, evaluateValue } from "../expressions";

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
      type={
        element.type === "email"
          ? "email"
          : element.type === "url"
            ? "url"
            : element.type === "phone"
              ? "tel"
              : "text"
      }
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

// ── Barcode / QR ─────────────────────────────────────────────────

const BarcodeField: Renderer = ({ element, value, onChange }) => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lang = useContext(LanguageContext);

  async function startScan() {
    if (!("BarcodeDetector" in window)) {
      setError("Barcode scanning is not supported in this browser. Enter value manually.");
      return;
    }
    try {
      setScanning(true);
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      // biome-ignore lint/suspicious/noExplicitAny: BarcodeDetector is not in TS lib yet
      const detector = new (window as any).BarcodeDetector();
      const track = stream.getVideoTracks()[0];
      // Grab a single frame via ImageCapture if available
      if ("ImageCapture" in window) {
        // biome-ignore lint/suspicious/noExplicitAny: ImageCapture not in TS lib
        const capture = new (window as any).ImageCapture(track);
        const bitmap = await capture.grabFrame();
        const codes = await detector.detect(bitmap);
        for (const t of stream.getTracks()) t.stop();
        if (codes.length > 0) {
          onChange(codes[0].rawValue);
        } else {
          setError("No barcode detected. Try again or enter manually.");
        }
      } else {
        for (const t of stream.getTracks()) t.stop();
        setError("ImageCapture not available. Enter value manually.");
      }
    } catch (err) {
      setError((err as Error).message || "Camera error.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="barcode-field">
      <div className="barcode-input-row">
        <input
          id={element.name}
          type="text"
          placeholder={localize(element.placeholder, lang) || "Scan or type a barcode…"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="button secondary" onClick={startScan} disabled={scanning}>
          {scanning ? "Scanning…" : "▥ Scan"}
        </button>
      </div>
      {error && <small className="error">{error}</small>}
    </div>
  );
};

// ── Geotrace / Geoshape ───────────────────────────────────────────

/** Collects a sequence of lat/lng points (geotrace = line, geoshape = closed polygon). */
function makeGeoTraceField(closed: boolean): Renderer {
  return ({ value, onChange }) => {
    type GeoPoint = { lat: number; lng: number };
    const points = (value ?? []) as GeoPoint[];
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function addCurrentLocation() {
      if (!navigator.geolocation) {
        setError("Geolocation isn't available in this browser.");
        return;
      }
      setBusy(true);
      setError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const pt: GeoPoint = {
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
          };
          const next = [...points, pt];
          // geoshape auto-closes: last point mirrors first
          onChange(closed && next.length >= 3 ? [...next, next[0]] : next);
          setBusy(false);
        },
        (err) => {
          setError(err.message || "Couldn't get location.");
          setBusy(false);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }

    function removePoint(idx: number) {
      const next = points.filter((_, i) => {
        if (closed && i === points.length - 1) return false; // remove auto-close tail
        return i !== idx;
      });
      onChange(closed && next.length >= 3 ? [...next, next[0]] : next);
    }

    const displayPoints = closed && points.length > 0 ? points.slice(0, -1) : points;

    return (
      <div className="geotrace-field">
        <div className="geotrace-points">
          {displayPoints.length === 0 && (
            <p className="hint">
              No points yet. Add at least {closed ? 3 : 2} to form a {closed ? "polygon" : "line"}.
            </p>
          )}
          {displayPoints.map((pt, i) => (
            <div key={`${i}-${pt.lat}`} className="geotrace-point-row">
              <span className="geotrace-index">{i + 1}</span>
              <span className="geotrace-coords">
                {pt.lat}, {pt.lng}
              </span>
              <button type="button" className="link-button danger" onClick={() => removePoint(i)}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="geotrace-actions">
          <button
            type="button"
            className="button secondary"
            onClick={addCurrentLocation}
            disabled={busy}
          >
            {busy ? "Locating…" : `📍 Add point (${displayPoints.length})`}
          </button>
          {displayPoints.length > 0 && (
            <button type="button" className="link-button danger" onClick={() => onChange([])}>
              Clear all
            </button>
          )}
        </div>
        {error && <small className="error">{error}</small>}
      </div>
    );
  };
}

const Geotrace = makeGeoTraceField(false);
const Geoshape = makeGeoTraceField(true);

// ── Metadata auto-capture (hidden, filled server-side) ────────────

/** Displayed as a read-only preview in the builder; invisible in the live renderer. */
const MetaField: Renderer = ({ element }) => (
  <div className="meta-field">
    <span className="meta-field-badge">auto</span>
    <span className="meta-field-desc">
      {(
        {
          start: "Captured when the form is opened",
          end: "Captured when the form is submitted",
          today: "Today's date",
          deviceid: "Browser fingerprint",
          username: "Signed-in user's email",
        } as Record<string, string>
      )[element.type] ?? "Automatic value"}
    </span>
  </div>
);

/** type -> renderer. Unknown types fall back to a text input. */
/** Read-only field showing a live-computed value from `element.calculate`. */
const Calculated: Renderer = ({ element, value, onChange, scope }) => {
  const computed = evaluateValue(element.calculate, scope ?? {});
  // Keep the answer in sync so the value is submitted (server recomputes authoritatively).
  // biome-ignore lint/correctness/useExhaustiveDependencies: write only when the result changes
  useEffect(() => {
    if (computed !== value) onChange(computed);
  }, [computed]);
  return (
    <output className="calc-field">{computed == null || computed === "" ? "—" : computed}</output>
  );
};

// ── Note / HTML display fields ────────────────────────────────────

const NoteField: Renderer = ({ element }) => {
  const lang = useContext(LanguageContext);
  const text = localize(element.label, lang) || "";
  return <div className="note-field">{text}</div>;
};

const HtmlField: Renderer = ({ element }) => {
  return (
    <div
      className="html-field"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: form author is trusted
      dangerouslySetInnerHTML={{ __html: (element as { html?: string }).html ?? "" }}
    />
  );
};

// ── Ranking ───────────────────────────────────────────────────────

const RankingField: Renderer = ({ element, value, onChange }) => {
  const lang = useContext(LanguageContext);
  const opts = element.options ?? [];
  const order: Array<string | number | boolean> = Array.isArray(value)
    ? (value as Array<string | number | boolean>)
    : opts.map((o) => o.value);

  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const labelOf = (v: string | number | boolean) => {
    const opt = opts.find((o) => o.value === v);
    return opt ? localize(opt.label, lang) || String(opt.value) : String(v);
  };

  function move(from: number, to: number) {
    if (from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <ol className="ranking-list">
      {order.map((v, i) => (
        <li
          key={String(v)}
          className={[
            "ranking-item",
            dragging === i ? "ranking-dragging" : "",
            over === i && dragging !== i ? "ranking-over" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          draggable
          onDragStart={() => setDragging(i)}
          onDragEnd={() => {
            if (dragging !== null && over !== null) move(dragging, over);
            setDragging(null);
            setOver(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(i);
          }}
          onDragLeave={() => setOver(null)}
        >
          <span className="ranking-handle" aria-hidden="true">
            ⠿
          </span>
          <span className="ranking-index">{i + 1}</span>
          <span className="ranking-label">{labelOf(v)}</span>
        </li>
      ))}
    </ol>
  );
};

// ── DateRange field ───────────────────────────────────────────────

const DateRangeField: Renderer = ({ element, value, onChange }) => {
  const val = (value as { start?: string; end?: string }) ?? {};
  return (
    <div className="field-date-range">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: htmlFor targets sibling input */}
      <label className="dr-label" htmlFor={`${element.name}-start`}>
        From
      </label>
      <input
        id={`${element.name}-start`}
        type="date"
        value={val.start ?? ""}
        disabled={element.readOnly}
        onChange={(e) => onChange({ ...val, start: e.target.value })}
      />
      {/* biome-ignore lint/a11y/noLabelWithoutControl: htmlFor targets sibling input */}
      <label className="dr-label" htmlFor={`${element.name}-end`}>
        To
      </label>
      <input
        id={`${element.name}-end`}
        type="date"
        value={val.end ?? ""}
        disabled={element.readOnly}
        min={val.start}
        onChange={(e) => onChange({ ...val, end: e.target.value })}
      />
    </div>
  );
};

// ── Address field ─────────────────────────────────────────────────

const AddressField: Renderer = ({ element, value, onChange }) => {
  const val = (value as Record<string, string>) ?? {};
  function f(key: string, placeholder: string, wide = false) {
    return (
      <input
        className={wide ? "addr-wide" : "addr-short"}
        type="text"
        placeholder={placeholder}
        value={val[key] ?? ""}
        disabled={element.readOnly}
        onChange={(e) => onChange({ ...val, [key]: e.target.value })}
      />
    );
  }
  return (
    <div className="field-address">
      {f("street", "Street address", true)}
      {f("city", "City")}
      {f("state", "State / Province")}
      {f("zip", "Postal code")}
      {f("country", "Country")}
    </div>
  );
};

// ── Signature pad ─────────────────────────────────────────────────

const SignatureField: Renderer = ({ value, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: restore saved signature only on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (typeof value === "string" && value.startsWith("data:")) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = e.currentTarget.width / rect.width;
    const scaleY = e.currentTarget.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function onPointerUp() {
    drawing.current = false;
    onChange(canvasRef.current?.toDataURL("image/png") ?? "");
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="signature-field">
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        width={480}
        height={180}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Signature pad — draw your signature here"
      />
      <button type="button" className="link-button" onClick={clear}>
        Clear
      </button>
    </div>
  );
};

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
  geotrace: Geotrace,
  geoshape: Geoshape,
  barcode: BarcodeField,
  start: MetaField,
  end: MetaField,
  today: MetaField,
  deviceid: MetaField,
  username: MetaField,
  phone: TextField,
  url: TextField,
  note: NoteField,
  html: HtmlField,
  calculated: Calculated,
  ranking: RankingField,
  signature: SignatureField,
  date_range: DateRangeField,
  address: AddressField,
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

import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";

/**
 * The visual body of a canvas card: a faithful, non-interactive preview of the question
 * as respondents will see it. For choice-based questions the options become directly
 * editable in place while the card is selected — no trip to the properties panel.
 */
export function CardPreview({ element, editable }: { element: Element; editable: boolean }) {
  switch (element.type) {
    case "text":
    case "email":
    case "url":
    case "phone":
      return <div className="pv-input">{localize(element.placeholder) || "Short answer"}</div>;
    case "number":
    case "integer":
    case "decimal":
      return <div className="pv-input pv-narrow">123</div>;
    case "date":
      return <div className="pv-input pv-narrow">Select a date 📅</div>;
    case "time":
      return <div className="pv-input pv-narrow">Select a time ⏰</div>;
    case "datetime":
      return <div className="pv-input pv-narrow">Select date &amp; time 📆</div>;
    case "date_range":
      return (
        <div className="pv-range">
          <div className="pv-input pv-narrow">From 📅</div>
          <span className="pv-range-sep">→</span>
          <div className="pv-input pv-narrow">To 📅</div>
        </div>
      );
    case "address":
      return (
        <div className="pv-address">
          <div className="pv-input">Street address</div>
          <div className="pv-input">City</div>
          <div className="pv-input pv-narrow">Postal code</div>
        </div>
      );
    case "longtext":
      return (
        <div className="pv-input pv-tall">{localize(element.placeholder) || "Long answer"}</div>
      );
    case "single_choice":
    case "multi_choice":
      return editable ? (
        <OptionEditor element={element} />
      ) : (
        <ul className="pv-options">
          {(element.options ?? []).map((o) => (
            <li key={String(o.value)} data-opt-value={String(o.value)}>
              <span className="pv-mark">{element.type === "single_choice" ? "◯" : "☐"}</span>
              {localize(o.label) || String(o.value)}
            </li>
          ))}
        </ul>
      );
    case "dropdown":
      return editable ? (
        <OptionEditor element={element} />
      ) : (
        <div className="pv-input pv-narrow">
          {localize(element.options?.[0]?.label) || "Select…"} <span className="pv-caret">▾</span>
        </div>
      );
    case "boolean":
      return (
        <div className="pv-pills">
          <span className="pv-pill">Yes</span>
          <span className="pv-pill">No</span>
        </div>
      );
    case "rating":
      return (
        <div className="pv-stars" aria-hidden="true">
          {(element.options ?? [1, 2, 3, 4, 5]).map((o, i) => (
            <span key={typeof o === "object" ? String(o.value) : i}>☆</span>
          ))}
        </div>
      );
    case "scale":
      return (
        <div className="pv-pills">
          {(element.options ?? []).map((o) => (
            <span key={String(o.value)} className="pv-pill pv-pill-sm">
              {localize(o.label) || String(o.value)}
            </span>
          ))}
        </div>
      );
    case "ranking":
      return (
        <ul className="pv-options">
          {(element.options ?? []).map((o, i) => (
            <li key={String(o.value)}>
              <span className="pv-mark">{i + 1}.</span>
              {localize(o.label) || String(o.value)}
            </li>
          ))}
        </ul>
      );
    case "matrix":
      return (
        <table className="pv-matrix">
          <thead>
            <tr>
              <th />
              {(element.columns ?? []).map((c) => (
                <th key={String(c.value)}>{localize(c.label) || String(c.value)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(element.rows ?? []).map((r) => (
              <tr key={String(r.value)}>
                <td>{localize(r.label) || String(r.value)}</td>
                {(element.columns ?? []).map((c) => (
                  <td key={String(c.value)} className="pv-cell">
                    ◯
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "file":
    case "image":
      return <div className="pv-upload">📎 Drop a file or click to upload</div>;
    case "signature":
      return <div className="pv-upload">✍️ Sign here</div>;
    case "geopoint":
      return <div className="pv-upload">📍 Pick a location on the map</div>;
    case "geotrace":
      return <div className="pv-upload">〰️ Trace a path on the map</div>;
    case "geoshape":
      return <div className="pv-upload">⬡ Draw an area on the map</div>;
    case "barcode":
      return <div className="pv-input pv-narrow">▥ Scan a barcode / QR</div>;
    case "note":
    case "html":
      return <div className="pv-note">{localize(element.label) || "Informational text"}</div>;
    case "repeat": {
      const fieldCount = element.elements?.length ?? 0;
      const minMax = [
        element.repeat?.min != null ? `min ${element.repeat.min}` : null,
        element.repeat?.max != null ? `max ${element.repeat.max}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return (
        <div className="pv-container-summary">
          <span className="pv-container-icon">↻</span>
          <span>
            Repeating · {fieldCount} {fieldCount === 1 ? "field" : "fields"}
            {minMax ? ` · ${minMax}` : ""}
          </span>
        </div>
      );
    }
    case "group": {
      const fieldCount = element.elements?.length ?? 0;
      return (
        <div className="pv-container-summary">
          <span className="pv-container-icon">⊞</span>
          <span>
            Group · {fieldCount} {fieldCount === 1 ? "field" : "fields"}
          </span>
        </div>
      );
    }
    default:
      return null;
  }
}

/** In-place editor for the option list of choice questions (shown while selected). */
function OptionEditor({ element }: { element: Element }) {
  const { updateOption, removeOption, addOption } = useBuilderStore();
  const mark = element.type === "multi_choice" ? "☐" : element.type === "dropdown" ? "▾" : "◯";

  return (
    <div className="pv-option-editor">
      {(element.options ?? []).map((o, i) => (
        <div key={String(o.value)} className="pv-option-row" data-opt-value={String(o.value)}>
          <span className="pv-mark">{mark}</span>
          <input
            value={localize(o.label)}
            placeholder={`Option ${i + 1}`}
            onChange={(e) => updateOption(element.name, i, { label: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            title="Remove option"
            onClick={() => removeOption(element.name, i)}
            disabled={(element.options ?? []).length <= 1}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="pv-add-option" onClick={() => addOption(element.name)}>
        + Add option
      </button>
    </div>
  );
}

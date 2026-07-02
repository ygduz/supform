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
            <li key={String(o.value)}>
              <span className="pv-mark">{element.type === "single_choice" ? "◯" : "☐"}</span>
              {localize(o.label) || String(o.value)}
              {o.correct && (
                <span className="pv-correct" title="Correct answer" aria-label="Correct answer">
                  ✓
                </span>
              )}
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
      return editable ? (
        <RatingEditor element={element} />
      ) : (
        <div className="pv-stars" aria-hidden="true">
          {Array.from({ length: element.ratingMax ?? 5 }, (_, i) => i + 1).map((level) =>
            element.ratingGlyph === "number" ? (
              <span key={level}>{level}</span>
            ) : (
              <span key={level}>☆</span>
            ),
          )}
        </div>
      );
    case "scale":
      return editable ? (
        <ScaleEditor element={element} />
      ) : (
        <div className="pv-scale">
          <span className="pv-scale-label">{localize(element.scaleLabelLow) || ""}</span>
          <div className="pv-pills">
            {(element.options ?? []).map((o) => (
              <span key={String(o.value)} className="pv-pill pv-pill-sm">
                {localize(o.label) || String(o.value)}
              </span>
            ))}
          </div>
          <span className="pv-scale-label">{localize(element.scaleLabelHigh) || ""}</span>
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
      return editable ? (
        <MatrixEditor element={element} />
      ) : (
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
                    {element.matrixMulti ? "☐" : "◯"}
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
    // biome-ignore lint/a11y/useKeyWithClickEvents: intercepts bubbling from real buttons/inputs below, not itself interactive
    <div className="pv-option-editor" onClick={(e) => e.stopPropagation()}>
      {(element.options ?? []).map((o, i) => (
        <div key={String(o.value)} className="pv-option-row">
          <span className="pv-mark">{mark}</span>
          <input
            value={localize(o.label)}
            placeholder={`Option ${i + 1}`}
            onChange={(e) => updateOption(element.name, i, { label: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && i === (element.options ?? []).length - 1) {
                e.preventDefault();
                addOption(element.name);
              }
            }}
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

/** In-place editor for a rating question's level count and glyph (stars vs. numbers). */
function RatingEditor({ element }: { element: Element }) {
  const update = useBuilderStore((s) => s.update);
  const max = element.ratingMax ?? 5;
  const glyph = element.ratingGlyph ?? "star";

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: intercepts bubbling from real buttons below, not itself interactive
    <div
      className="pv-rating-editor"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pv-stepper">
        <button
          type="button"
          disabled={max <= 2}
          onClick={() => update(element.name, { ratingMax: Math.max(2, max - 1) })}
        >
          −
        </button>
        <span>{max} levels</span>
        <button
          type="button"
          disabled={max >= 10}
          onClick={() => update(element.name, { ratingMax: Math.min(10, max + 1) })}
        >
          +
        </button>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a button toggle group, not a form fieldset */}
      <div className="pv-glyph-toggle" role="group" aria-label="Rating glyph">
        <button
          type="button"
          className={glyph === "star" ? "active" : ""}
          onClick={() => update(element.name, { ratingGlyph: "star" })}
        >
          ☆ Stars
        </button>
        <button
          type="button"
          className={glyph === "number" ? "active" : ""}
          onClick={() => update(element.name, { ratingGlyph: "number" })}
        >
          1 Numbers
        </button>
      </div>
    </div>
  );
}

/** In-place editor for a linear scale's bounds and anchor labels. */
function ScaleEditor({ element }: { element: Element }) {
  const update = useBuilderStore((s) => s.update);
  const min = element.validation?.min ?? 1;
  const max = element.validation?.max ?? 5;

  const setBounds = (nextMin: number, nextMax: number) => {
    const options = [];
    for (let v = nextMin; v <= nextMax; v++) options.push({ value: v, label: String(v) });
    update(element.name, {
      validation: { ...element.validation, min: nextMin, max: nextMax },
      options,
    });
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: intercepts bubbling from real buttons/inputs below, not itself interactive
    <div
      className="pv-scale-editor"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pv-scale-bounds">
        <div className="pv-stepper">
          <button type="button" disabled={min <= 0} onClick={() => setBounds(min - 1, max)}>
            −
          </button>
          <span>From {min}</span>
          <button type="button" disabled={max - min <= 1} onClick={() => setBounds(min + 1, max)}>
            +
          </button>
        </div>
        <div className="pv-stepper">
          <button type="button" disabled={max - min <= 1} onClick={() => setBounds(min, max - 1)}>
            −
          </button>
          <span>To {max}</span>
          <button type="button" disabled={max >= 10} onClick={() => setBounds(min, max + 1)}>
            +
          </button>
        </div>
      </div>
      <div className="pv-scale-anchors">
        <input
          placeholder="Low label (optional)"
          value={localize(element.scaleLabelLow)}
          onChange={(e) => update(element.name, { scaleLabelLow: e.target.value })}
        />
        <input
          placeholder="High label (optional)"
          value={localize(element.scaleLabelHigh)}
          onChange={(e) => update(element.name, { scaleLabelHigh: e.target.value })}
        />
      </div>
    </div>
  );
}

/** In-place editor for a matrix's rows, columns, and single/multi-select mode. */
function MatrixEditor({ element }: { element: Element }) {
  const { updateRow, addRow, removeRow, updateColumn, addColumn, removeColumn, update } =
    useBuilderStore();
  const rows = element.rows ?? [];
  const columns = element.columns ?? [];

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: intercepts bubbling from real buttons/inputs below, not itself interactive
    <div
      className="pv-matrix-editor"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pv-matrix-editor-col">
        <span className="pv-matrix-editor-title">Rows</span>
        {rows.map((r, i) => (
          <div key={String(r.value)} className="pv-option-row">
            <input
              value={localize(r.label)}
              placeholder={`Row ${i + 1}`}
              onChange={(e) => updateRow(element.name, i, { label: e.target.value })}
            />
            <button
              type="button"
              title="Remove row"
              onClick={() => removeRow(element.name, i)}
              disabled={rows.length <= 1}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="pv-add-option" onClick={() => addRow(element.name)}>
          + Add row
        </button>
      </div>
      <div className="pv-matrix-editor-col">
        <span className="pv-matrix-editor-title">Columns</span>
        {columns.map((c, i) => (
          <div key={String(c.value)} className="pv-option-row">
            <input
              value={localize(c.label)}
              placeholder={`Column ${i + 1}`}
              onChange={(e) => updateColumn(element.name, i, { label: e.target.value })}
            />
            <button
              type="button"
              title="Remove column"
              onClick={() => removeColumn(element.name, i)}
              disabled={columns.length <= 1}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="pv-add-option" onClick={() => addColumn(element.name)}>
          + Add column
        </button>
      </div>
      <label className="pv-matrix-multi-toggle">
        <input
          type="checkbox"
          checked={element.matrixMulti ?? false}
          onChange={(e) => update(element.name, { matrixMulti: e.target.checked })}
        />
        Allow multiple selections per row
      </label>
    </div>
  );
}

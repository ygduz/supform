import type { ReactNode, SelectHTMLAttributes } from "react";

interface OptionItem {
  value: string;
  label: string;
  disabled?: boolean;
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options?: OptionItem[];
  children?: ReactNode;
}

export function Select({
  label,
  hint,
  error,
  options,
  children,
  className = "",
  id,
  ...rest
}: Props) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={`field ${error ? "field--error" : ""} ${className}`}>
      {label && (
        <label className="field-label" htmlFor={selectId}>
          {label}
          {rest.required && (
            <span className="field-required" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </label>
      )}
      <div className="field-wrap field-wrap--select">
        <select id={selectId} className="field-input" {...rest}>
          {options
            ? options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))
            : children}
        </select>
        <span className="field-select-arrow" aria-hidden="true">
          ▾
        </span>
      </div>
      {error && <p className="field-error">{error}</p>}
      {hint && !error && <p className="field-hint">{hint}</p>}
    </div>
  );
}

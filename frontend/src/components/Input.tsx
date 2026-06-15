import type { InputHTMLAttributes, ReactNode } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Leading content (icon or text) inside the input box. */
  leading?: ReactNode;
}

export function Input({ label, hint, error, leading, className = "", id, ...rest }: Props) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={`field ${error ? "field--error" : ""} ${className}`}>
      {label && (
        <label className="field-label" htmlFor={inputId}>
          {label}
          {rest.required && (
            <span className="field-required" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </label>
      )}
      <div className="field-wrap">
        {leading && <span className="field-leading">{leading}</span>}
        <input
          id={inputId}
          className={`field-input ${leading ? "field-input--with-leading" : ""}`}
          {...rest}
        />
      </div>
      {error && <p className="field-error">{error}</p>}
      {hint && !error && <p className="field-hint">{hint}</p>}
    </div>
  );
}

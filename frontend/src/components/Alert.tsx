import type { ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "danger";

interface Props {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  className?: string;
  onDismiss?: () => void;
}

const ICONS: Record<Tone, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  danger: "✕",
};

export function Alert({ tone = "info", title, children, className = "", onDismiss }: Props) {
  return (
    <div className={`alert alert--${tone} ${className}`} role="alert">
      <span className="alert-icon" aria-hidden="true">
        {ICONS[tone]}
      </span>
      <div className="alert-content">
        {title && <strong className="alert-title">{title}</strong>}
        <div className="alert-body">{children}</div>
      </div>
      {onDismiss && (
        <button type="button" className="alert-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

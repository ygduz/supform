import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const VAR: Record<Variant, string> = {
  primary: "btn btn--primary",
  secondary: "btn btn--secondary",
  ghost: "btn btn--ghost",
  danger: "btn btn--danger",
  outline: "btn btn--outline",
};

const SZ: Record<Size, string> = {
  sm: "btn--sm",
  md: "",
  lg: "btn--lg",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  disabled,
  className = "",
  ...rest
}: Props) {
  const classes = [VAR[variant], SZ[size], loading ? "btn--loading" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} disabled={disabled || loading} {...rest}>
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      {icon && !loading && <span className="btn-icon">{icon}</span>}
      {children && <span>{children}</span>}
    </button>
  );
}

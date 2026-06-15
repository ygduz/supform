import type { HTMLAttributes, ReactNode } from "react";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
}

const TONE: Record<Tone, string> = {
  neutral: "badge--neutral",
  primary: "badge--primary",
  success: "badge--success",
  warning: "badge--warning",
  danger: "badge--danger",
  info: "badge--info",
};

export function Badge({ tone = "neutral", children, className = "", ...rest }: Props) {
  return (
    <span className={`badge ${TONE[tone]} ${className}`} {...rest}>
      {children}
    </span>
  );
}

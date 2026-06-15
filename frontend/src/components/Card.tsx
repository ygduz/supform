import type { HTMLAttributes, ReactNode } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Remove the default padding. */
  noPad?: boolean;
  /** Subtle sunken appearance. */
  sunken?: boolean;
}

export function Card({ children, noPad, sunken, className = "", ...rest }: Props) {
  const classes = ["card", noPad ? "card--no-pad" : "", sunken ? "card--sunken" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

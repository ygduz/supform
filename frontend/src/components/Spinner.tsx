interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className = "" }: Props) {
  return (
    <span className={`spinner spinner--${size} ${className}`} role="status" aria-label="Loading" />
  );
}

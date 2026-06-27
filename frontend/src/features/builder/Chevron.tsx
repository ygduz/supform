/** Crisp stroked chevron for the panel collapse toggles — replaces the thin ‹/› glyph. */
export function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      className="panel-toggle-chevron"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

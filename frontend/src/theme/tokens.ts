/**
 * Design tokens. Forms are themeable; a form's `theme` overrides these at render time.
 * Keep this the single source of visual constants for the app shell & default form theme.
 */
export const tokens = {
  color: {
    primary: "#2563eb",
    primaryHover: "#1d4ed8",
    text: "#0f172a",
    muted: "#64748b",
    border: "#e2e8f0",
    background: "#ffffff",
    surface: "#f8fafc",
    error: "#dc2626",
  },
  radius: { sm: "6px", md: "10px", lg: "16px" },
  font: { sans: "Inter, system-ui, -apple-system, sans-serif" },
  space: (n: number) => `${n * 4}px`,
} as const;

import type { Theme } from "@/types/form-schema";
import type { CSSProperties } from "react";

/**
 * Map a form's Theme onto inline CSS variables that the renderer's stylesheet already
 * reads (--primary, --radius, --font), plus direct background/font properties. Applying it
 * on the form root means every themed widget (buttons, inputs, cards) updates at once.
 */
export function themeToStyle(theme?: Theme): CSSProperties {
  const style: Record<string, string> = {};
  if (!theme) return style as CSSProperties;
  if (theme.primaryColor) {
    style["--primary"] = theme.primaryColor;
    style["--primary-hover"] = theme.primaryColor;
  }
  if (theme.backgroundColor) style.background = theme.backgroundColor;
  if (theme.fontFamily) {
    style["--font"] = theme.fontFamily;
    style.fontFamily = theme.fontFamily;
  }
  if (typeof theme.cornerRadius === "number") style["--radius"] = `${theme.cornerRadius}px`;
  return style as CSSProperties;
}

import type { I18nString } from "@/types/form-schema";

/** Resolve an i18n string to a single language, with fallback. */
export function localize(value: I18nString | undefined, lang = "en", fallback = "en"): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[lang] ?? value[fallback] ?? Object.values(value)[0] ?? "";
}

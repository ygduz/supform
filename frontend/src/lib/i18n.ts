import type { I18nString } from "@/types/form-schema";
import { createContext, useContext } from "react";

/** Resolve an i18n string to a single language, with fallback. */
export function localize(value: I18nString | undefined, lang = "en", fallback = "en"): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[lang] ?? value[fallback] ?? Object.values(value)[0] ?? "";
}

/**
 * The language the renderer is currently showing. Provided by FormRenderer so deeply
 * nested field widgets (option labels, placeholders) localize without prop-drilling.
 */
export const LanguageContext = createContext<string>("en");

/** Convenience: localize a value in the active renderer language. */
export function useLocalize(): (value: I18nString | undefined) => string {
  const lang = useContext(LanguageContext);
  return (value) => localize(value, lang);
}

/** List the languages a form offers, with defaultLanguage first (the initial view). */
export function formLanguages(languages?: string[], defaultLanguage?: string): string[] {
  const list = languages && languages.length > 0 ? [...languages] : [];
  if (!defaultLanguage) return list;
  const rest = list.filter((code) => code !== defaultLanguage);
  // An empty list means the form isn't multilingual — don't invent a single language.
  return list.length === 0 ? [] : [defaultLanguage, ...rest];
}

/** A human label for a language code (falls back to the upper-cased code). */
export function languageLabel(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

import { localize } from "@/lib/i18n";
import type { Element, FormSchema } from "@/types/form-schema";

type Answers = Record<string, unknown>;

/** Flat name → element lookup across the whole form (for answer piping). */
export function elementIndex(schema: FormSchema): Map<string, Element> {
  const map = new Map<string, Element>();
  const walk = (els: Element[]) => {
    for (const el of els) {
      map.set(el.name, el);
      if (el.elements) walk(el.elements);
    }
  };
  for (const p of schema.pages) walk(p.elements);
  return map;
}

/** Human-readable text for an answer (resolving choice values to their labels). */
export function displayValue(el: Element | undefined, raw: unknown, lang: string): string {
  if (raw == null || raw === "") return "";
  const values = Array.isArray(raw) ? raw : [raw];
  if (el?.options) {
    return values
      .map((v) => {
        const opt = el.options?.find((o) => o.value === v);
        return opt ? localize(opt.label, lang) : String(v);
      })
      .join(", ");
  }
  return values.map((v) => String(v)).join(", ");
}

/**
 * Answer piping: replace `{field}` tokens in already-localized text with the live
 * display value of that answer (empty until answered). Unknown tokens are left
 * verbatim so stray braces in copy aren't silently eaten. Lets authors write
 * "Thanks {name}, how did you hear about us?".
 */
export function pipe(
  text: string,
  index: Map<string, Element>,
  answers: Answers,
  lang: string,
): string {
  if (!text.includes("{")) return text;
  return text.replace(/\{([A-Za-z_][\w]*)\}/g, (match, fieldName: string) =>
    index.has(fieldName) ? displayValue(index.get(fieldName), answers[fieldName], lang) : match,
  );
}

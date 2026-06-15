import { localize } from "@/lib/i18n";
import type { useBuilderStore } from "@/stores/builderStore";
import type { Element, FormSchema, I18nString } from "@/types/form-schema";

// ── i18n value helpers ───────────────────────────────────────────

export function translationFor(
  value: I18nString | undefined,
  lang: string,
  defaultLang: string,
): string {
  if (value == null) return "";
  if (typeof value === "string") return lang === defaultLang ? value : "";
  return value[lang] ?? "";
}

export function withTranslation(
  value: I18nString | undefined,
  lang: string,
  text: string,
  defaultLang: string,
): I18nString | undefined {
  const obj: Record<string, string> =
    typeof value === "object" && value !== null
      ? { ...value }
      : typeof value === "string" && value
        ? { [defaultLang]: value }
        : {};
  if (text) obj[lang] = text;
  else delete obj[lang];
  const keys = Object.keys(obj);
  if (keys.length === 0) return undefined;
  if (keys.length === 1 && keys[0] === defaultLang) return obj[defaultLang];
  return obj;
}

// ── Row collection (drives the Translate grid + AI fill) ─────────

export interface TRow {
  key: string;
  path: string;
  value: I18nString | undefined;
  save: (v: I18nString | undefined) => void;
}

export function collectRows(
  schema: FormSchema,
  defaultLang: string,
  store: ReturnType<typeof useBuilderStore.getState>,
): TRow[] {
  const rows: TRow[] = [];

  const push = (
    key: string,
    path: string,
    value: I18nString | undefined,
    save: (v: I18nString | undefined) => void,
  ) => {
    if (value == null || value === "") return;
    rows.push({ key, path, value, save });
  };

  push("form.title", "Form title", schema.title, (v) => store.setTitle(v ?? ""));

  const s = schema.settings;
  if (s) {
    push("s.submit", "Submit button", s.submitButtonText, (v) =>
      store.setSettings({ submitButtonText: v }),
    );
    push("s.confirm", "Confirmation message", s.confirmationMessage, (v) =>
      store.setSettings({ confirmationMessage: v }),
    );
    push("s.wTitle", "Welcome title", s.welcomeTitle, (v) =>
      store.setSettings({ welcomeTitle: v }),
    );
    push("s.wMsg", "Welcome message", s.welcomeMessage, (v) =>
      store.setSettings({ welcomeMessage: v }),
    );
  }

  schema.pages.forEach((page, pi) => {
    push(`p${pi}.title`, `Page ${pi + 1} title`, page.title, (v) =>
      store.setPageTitle(pi, v ?? ""),
    );

    const walkEls = (els: Element[], pfx: string) => {
      for (const el of els) {
        const displayLabel = localize(el.label, defaultLang) || el.name;
        push(`${pfx}${el.name}.label`, `${displayLabel}`, el.label, (v) =>
          store.update(el.name, { label: v }),
        );
        push(`${pfx}${el.name}.hint`, `${displayLabel} — hint`, el.hint, (v) =>
          store.update(el.name, { hint: v }),
        );
        push(`${pfx}${el.name}.placeholder`, `${displayLabel} — placeholder`, el.placeholder, (v) =>
          store.update(el.name, { placeholder: v }),
        );
        (el.options ?? []).forEach((opt, oi) => {
          push(
            `${pfx}${el.name}.opt${oi}`,
            `${displayLabel} › ${localize(opt.label, defaultLang) || String(opt.value)}`,
            opt.label,
            (v) => store.updateOption(el.name, oi, { label: v }),
          );
        });
        (el.rows ?? []).forEach((r, ri) => {
          push(`${pfx}${el.name}.row${ri}`, `${displayLabel} › row ${ri + 1}`, r.label, (v) =>
            store.updateRow(el.name, ri, { label: v }),
          );
        });
        (el.columns ?? []).forEach((c, ci) => {
          push(`${pfx}${el.name}.col${ci}`, `${displayLabel} › col ${ci + 1}`, c.label, (v) =>
            store.updateColumn(el.name, ci, { label: v }),
          );
        });
        if (el.elements) walkEls(el.elements, `${pfx}${el.name}.`);
      }
    };
    walkEls(page.elements, `p${pi}.`);
  });

  return rows;
}

/** Per-language completion stats over the translatable rows. */
export function translationProgress(rows: TRow[], lang: string, defaultLang: string) {
  const total = rows.length;
  const filled = rows.filter((r) => translationFor(r.value, lang, defaultLang) !== "").length;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 100;
  return { total, filled, pct };
}

// ── Standalone copy: produce a monolingual schema in one language ─

interface Slot {
  get: () => string;
  set: (v: string) => void;
}

/**
 * Walk every translatable string in a (cloned) schema, returning getter/setter slots.
 * `get` reads the source-language value; `set` writes a plain monolingual string.
 * The walk order is deterministic so a collect pass and an apply pass stay aligned.
 */
function schemaStringSlots(schema: FormSchema, sourceLang: string): Slot[] {
  const slots: Slot[] = [];

  const slot = (read: () => I18nString | undefined, write: (text: string) => void) => {
    const src = localize(read(), sourceLang);
    if (!src) return;
    slots.push({ get: () => src, set: write });
  };

  slot(
    () => schema.title,
    (t) => {
      schema.title = t;
    },
  );

  if (schema.settings) {
    const s = schema.settings;
    slot(
      () => s.submitButtonText,
      (t) => {
        s.submitButtonText = t;
      },
    );
    slot(
      () => s.confirmationMessage,
      (t) => {
        s.confirmationMessage = t;
      },
    );
    slot(
      () => s.welcomeTitle,
      (t) => {
        s.welcomeTitle = t;
      },
    );
    slot(
      () => s.welcomeMessage,
      (t) => {
        s.welcomeMessage = t;
      },
    );
  }

  for (const page of schema.pages) {
    slot(
      () => page.title,
      (t) => {
        page.title = t;
      },
    );
    const walk = (els: Element[]) => {
      for (const el of els) {
        slot(
          () => el.label,
          (t) => {
            el.label = t;
          },
        );
        slot(
          () => el.hint,
          (t) => {
            el.hint = t;
          },
        );
        slot(
          () => el.placeholder,
          (t) => {
            el.placeholder = t;
          },
        );
        for (const opt of el.options ?? []) {
          slot(
            () => opt.label,
            (t) => {
              opt.label = t;
            },
          );
        }
        for (const r of el.rows ?? []) {
          slot(
            () => r.label,
            (t) => {
              r.label = t;
            },
          );
        }
        for (const c of el.columns ?? []) {
          slot(
            () => c.label,
            (t) => {
              c.label = t;
            },
          );
        }
        if (el.elements) walk(el.elements);
      }
    };
    walk(page.elements);
  }

  return slots;
}

/**
 * Build a new monolingual schema fully translated into `targetLang`.
 * Does not touch the original. `translate` batch-translates source strings.
 */
export async function translateSchemaToLanguage(
  schema: FormSchema,
  sourceLang: string,
  targetLang: string,
  translate: (texts: string[]) => Promise<string[]>,
): Promise<FormSchema> {
  const clone: FormSchema = JSON.parse(JSON.stringify(schema));
  const slots = schemaStringSlots(clone, sourceLang);
  const sources = slots.map((s) => s.get());
  const translated = sources.length > 0 ? await translate(sources) : [];
  slots.forEach((s, i) => s.set(translated[i] ?? sources[i]));
  clone.defaultLanguage = targetLang;
  clone.languages = [];
  return clone;
}

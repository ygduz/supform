import { api } from "@/api/client";
import { languageLabel, localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element, FormSchema, I18nString } from "@/types/form-schema";
import { useState } from "react";

// ── i18n helpers (mirrors PropertiesPanel — kept local to avoid circular deps) ──

function translationFor(value: I18nString | undefined, lang: string, defaultLang: string): string {
  if (value == null) return "";
  if (typeof value === "string") return lang === defaultLang ? value : "";
  return value[lang] ?? "";
}

function withTranslation(
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

// ── Row collection ───────────────────────────────────────────────

interface TRow {
  key: string;
  path: string;
  value: I18nString | undefined;
  save: (v: I18nString | undefined) => void;
}

function collectRows(
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
  push("form.desc", "Form description", schema.description, () => {});

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

// ── Component ────────────────────────────────────────────────────

export function TranslatePanel() {
  const store = useBuilderStore();
  const { schema } = store;
  const defaultLang = schema.defaultLanguage ?? "en";
  const otherLangs = (schema.languages ?? []).filter((l) => l !== defaultLang);
  const [targetLang, setTargetLang] = useState(otherLangs[0] ?? "");
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  if (otherLangs.length === 0) {
    return (
      <div className="translate-empty">
        <p>
          Add a second language in <strong>Settings</strong> to start translating.
        </p>
      </div>
    );
  }

  const activeLang = targetLang || otherLangs[0];
  const rows = collectRows(schema, defaultLang, useBuilderStore.getState());
  const untranslatedRows = rows.filter((r) => {
    const src = translationFor(r.value, defaultLang, defaultLang);
    const tgt = translationFor(r.value, activeLang, defaultLang);
    return src && !tgt;
  });
  const filled = rows.length - untranslatedRows.length;
  const pct = rows.length > 0 ? Math.round((filled / rows.length) * 100) : 0;

  async function handleAiTranslate() {
    if (untranslatedRows.length === 0) return;
    setTranslating(true);
    setTranslateError(null);
    try {
      const texts = untranslatedRows.map((r) => translationFor(r.value, defaultLang, defaultLang));
      const { translations } = await api.aiTranslate(texts, defaultLang, activeLang);
      for (let i = 0; i < untranslatedRows.length; i++) {
        const row = untranslatedRows[i];
        const text = translations[i];
        if (text) row.save(withTranslation(row.value, activeLang, text, defaultLang));
      }
    } catch (err) {
      setTranslateError((err as Error).message);
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className="translate-panel">
      <div className="translate-header">
        <select
          className="select"
          value={activeLang}
          onChange={(e) => setTargetLang(e.target.value)}
        >
          {otherLangs.map((l) => (
            <option key={l} value={l}>
              {languageLabel(l)} ({l})
            </option>
          ))}
        </select>
        <span className={`translate-progress ${pct === 100 ? "complete" : ""}`}>
          {filled}/{rows.length} — {pct}%
        </span>
        <button
          type="button"
          className="button button-sm"
          onClick={handleAiTranslate}
          disabled={translating || untranslatedRows.length === 0}
          title={untranslatedRows.length === 0 ? "All strings translated" : `Translate ${untranslatedRows.length} missing strings with AI`}
        >
          {translating ? "Translating…" : "✦ Translate with AI"}
        </button>
      </div>
      {translateError && <p className="error translate-ai-error">{translateError}</p>}

      <div className="translate-cols-head">
        <span>{languageLabel(defaultLang)}</span>
        <span>{languageLabel(activeLang)}</span>
      </div>

      <div className="translate-rows">
        {rows.map((r) => {
          const src = translationFor(r.value, defaultLang, defaultLang);
          const tgt = translationFor(r.value, activeLang, defaultLang);
          return (
            <div className="translate-row" key={r.key}>
              <p className="translate-path">{r.path}</p>
              <div className="translate-cells">
                <span className="translate-source">{src || <em className="muted">empty</em>}</span>
                <input
                  className={`translate-input${!tgt && src ? " untranslated" : ""}`}
                  type="text"
                  value={tgt}
                  placeholder={src || "…"}
                  onChange={(e) =>
                    r.save(withTranslation(r.value, activeLang, e.target.value, defaultLang))
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

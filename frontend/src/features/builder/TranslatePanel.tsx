import { api } from "@/api/client";
import { languageLabel } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import { useState } from "react";
import { collectRows, translationFor, translationProgress, withTranslation } from "./i18nRows";

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
  const { filled, total, pct } = translationProgress(rows, activeLang, defaultLang);

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
          {filled}/{total} — {pct}%
        </span>
        <button
          type="button"
          className="button button-sm"
          onClick={handleAiTranslate}
          disabled={translating || untranslatedRows.length === 0}
          title={
            untranslatedRows.length === 0
              ? "All strings translated"
              : `Translate ${untranslatedRows.length} missing strings with AI`
          }
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

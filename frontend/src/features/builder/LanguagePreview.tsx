import { api } from "@/api/client";
import { languageLabel } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { FormSchema } from "@/types/form-schema";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormRenderer } from "../renderer/FormRenderer";
import {
  collectRows,
  translateSchemaToLanguage,
  translationFor,
  translationProgress,
  withTranslation,
} from "./i18nRows";
import { COMMON_LANGUAGES } from "./languages";

type Busy = null | "translate" | "copy";

/**
 * The admin preview pane with an integrated language manager.
 *
 * Top: a dropdown to view the form in any of its languages (with completion %).
 * Bottom: "add a language version" — adds the language and auto-translates every
 * string with AI in one action, or spins off a standalone single-language copy.
 */
export function LanguagePreview({ schema }: { schema: FormSchema }) {
  const store = useBuilderStore();
  const navigate = useNavigate();
  const defaultLang = schema.defaultLanguage ?? "en";
  const langs = Array.from(new Set([defaultLang, ...(schema.languages ?? [])]));
  const isMultilingual = langs.length >= 2;

  const [viewLang, setViewLang] = useState(defaultLang);
  const [adding, setAdding] = useState(false);
  const [newLang, setNewLang] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep the view language valid if the language set changes underneath us.
  useEffect(() => {
    if (!langs.includes(viewLang)) setViewLang(defaultLang);
  }, [langs, viewLang, defaultLang]);

  const available = COMMON_LANGUAGES.filter((l) => !langs.includes(l.code));

  function completionFor(lang: string): number {
    if (lang === defaultLang) return 100;
    const rows = collectRows(schema, defaultLang, useBuilderStore.getState());
    return translationProgress(rows, lang, defaultLang).pct;
  }

  /** Add `code` to the form and auto-translate all strings into it with AI. */
  async function addAndTranslate(code: string) {
    setBusy("translate");
    setError(null);
    try {
      // Ensure default is present so the form is genuinely multilingual.
      const next = Array.from(new Set([defaultLang, ...(schema.languages ?? []), code]));
      store.setLanguages(next, defaultLang);

      // Re-collect against the freshly migrated schema, then fill the new language.
      const live = useBuilderStore.getState();
      const rows = collectRows(live.schema, defaultLang, live);
      const pending = rows.filter((r) => !translationFor(r.value, code, defaultLang));
      if (pending.length > 0) {
        const texts = pending.map((r) => translationFor(r.value, defaultLang, defaultLang));
        const { translations } = await api.aiTranslate(texts, defaultLang, code);
        pending.forEach((row, i) => {
          const text = translations[i];
          if (text) row.save(withTranslation(row.value, code, text, defaultLang));
        });
      }
      setViewLang(code);
      setAdding(false);
      setNewLang("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** Create a separate, single-language form fully translated into `code`. */
  async function createStandaloneCopy(code: string) {
    setBusy("copy");
    setError(null);
    try {
      const translated = await translateSchemaToLanguage(
        schema,
        defaultLang,
        code,
        async (texts) => (await api.aiTranslate(texts, defaultLang, code)).translations,
      );
      translated.name = `${schema.name || "form"}_${code}`;
      const projectId = store.projectId ?? (await resolveProjectId());
      const created = await api.createForm(projectId, translated);
      navigate(`/builder/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="lang-preview">
      {isMultilingual && (
        <div className="lang-preview-bar">
          <span className="muted">Viewing</span>
          <select
            className="select select-sm"
            value={viewLang}
            onChange={(e) => setViewLang(e.target.value)}
          >
            {langs.map((l) => {
              const pct = completionFor(l);
              return (
                <option key={l} value={l}>
                  {languageLabel(l)}
                  {l === defaultLang ? " (default)" : ` — ${pct}%`}
                </option>
              );
            })}
          </select>
        </div>
      )}

      <div className="preview-pane">
        <FormRenderer schema={schema} formId="preview" previewLang={viewLang} />
      </div>

      <div className="lang-versions">
        {!adding ? (
          <button
            type="button"
            className="lang-versions-add"
            onClick={() => setAdding(true)}
            disabled={available.length === 0}
          >
            ✦ Add a language version
          </button>
        ) : (
          <div className="lang-versions-form">
            <select
              className="select"
              value={newLang}
              onChange={(e) => setNewLang(e.target.value)}
              disabled={busy !== null}
            >
              <option value="">— pick a language —</option>
              {available.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} ({l.code})
                </option>
              ))}
            </select>
            <div className="lang-versions-actions">
              <button
                type="button"
                className="button button-sm"
                disabled={!newLang || busy !== null}
                onClick={() => addAndTranslate(newLang)}
                title="Add this language to the form and auto-translate every string"
              >
                {busy === "translate" ? "Translating…" : "Add & translate with AI"}
              </button>
              <button
                type="button"
                className="button button-sm secondary"
                disabled={!newLang || busy !== null}
                onClick={() => createStandaloneCopy(newLang)}
                title="Create a separate, single-language form translated into this language"
              >
                {busy === "copy" ? "Creating…" : "Standalone copy"}
              </button>
              <button
                type="button"
                className="link-button"
                disabled={busy !== null}
                onClick={() => {
                  setAdding(false);
                  setNewLang("");
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
            <small className="hint">
              <strong>Add &amp; translate</strong> keeps one form with a language switcher.{" "}
              <strong>Standalone copy</strong> makes a separate form with its own link and
              responses.
            </small>
          </div>
        )}
        {error && <p className="error lang-versions-error">{error}</p>}
      </div>
    </div>
  );
}

async function resolveProjectId(): Promise<string> {
  const projects = await api.listProjects();
  if (projects.length > 0) return projects[0].id;
  const created = await api.createProject("My forms");
  return created.id;
}

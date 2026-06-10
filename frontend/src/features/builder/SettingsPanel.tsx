import { languageLabel, localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import { useState } from "react";

/** Form-level collection settings. Enforced server-side on the public submit endpoint. */
export function SettingsPanel() {
  const { schema, setSettings, setLanguages } = useBuilderStore();
  const settings = schema.settings ?? {};
  const languages = schema.languages ?? [];
  const defaultLanguage = schema.defaultLanguage ?? "en";
  const [newLang, setNewLang] = useState("");

  const addLanguage = () => {
    const code = newLang.trim().toLowerCase();
    if (!code || languages.includes(code)) return;
    setLanguages([...languages, code]);
    setNewLang("");
  };
  const removeLanguage = (code: string) =>
    setLanguages(
      languages.filter((c) => c !== code),
      defaultLanguage === code ? undefined : defaultLanguage,
    );

  return (
    <div className="props">
      <h3>Form settings</h3>

      <div className="prop">
        <span>Languages</span>
        <small className="hint">
          Add language codes (e.g. <code>en</code>, <code>fr</code>) to offer the form in multiple
          languages. Respondents get a language switcher.
        </small>
        {languages.length > 0 && (
          <ul className="lang-list">
            {languages.map((code) => (
              <li key={code}>
                <label className="prop-check">
                  <input
                    type="radio"
                    name="default-language"
                    checked={defaultLanguage === code}
                    onChange={() => setLanguages(languages, code)}
                  />
                  <span>
                    {languageLabel(code)} <code>{code}</code>
                    {defaultLanguage === code && <em className="muted"> (default)</em>}
                  </span>
                </label>
                <button type="button" className="link-button" onClick={() => removeLanguage(code)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="lang-add">
          <input
            type="text"
            value={newLang}
            placeholder="Language code"
            onChange={(e) => setNewLang(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLanguage();
              }
            }}
          />
          <button type="button" onClick={addLanguage} disabled={!newLang.trim()}>
            Add language
          </button>
        </div>
      </div>

      <label className="prop prop-check">
        <input
          type="checkbox"
          checked={Boolean(settings.requireLogin)}
          onChange={(e) => setSettings({ requireLogin: e.target.checked })}
        />
        <span>Require sign-in to respond</span>
      </label>

      <label className="prop prop-check">
        <input
          type="checkbox"
          checked={settings.allowMultipleSubmissions !== false}
          onChange={(e) => setSettings({ allowMultipleSubmissions: e.target.checked })}
        />
        <span>Allow multiple responses per person</span>
      </label>

      <label className="prop">
        <span>Display mode</span>
        <select
          className="select"
          value={settings.displayMode ?? ""}
          onChange={(e) =>
            setSettings({
              displayMode: (e.target.value || undefined) as
                | "single"
                | "paged"
                | "oneQuestionPerScreen"
                | undefined,
            })
          }
        >
          <option value="">Automatic (paged when multi-page)</option>
          <option value="single">Single page</option>
          <option value="paged">Paged</option>
          <option value="oneQuestionPerScreen">One question per screen</option>
        </select>
        <small className="hint">How respondents step through the form.</small>
      </label>

      <label className="prop prop-check">
        <input
          type="checkbox"
          checked={Boolean(settings.showProgressBar)}
          onChange={(e) => setSettings({ showProgressBar: e.target.checked })}
        />
        <span>Show progress bar</span>
      </label>

      <label className="prop">
        <span>Close date</span>
        <input
          type="datetime-local"
          value={settings.closeDate ?? ""}
          onChange={(e) => setSettings({ closeDate: e.target.value || undefined })}
        />
        <small className="hint">After this time the form stops accepting responses.</small>
      </label>

      <label className="prop">
        <span>Response limit</span>
        <input
          type="number"
          min={0}
          value={settings.maxResponses ?? ""}
          placeholder="No limit"
          onChange={(e) =>
            setSettings({
              maxResponses: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
        />
      </label>

      <label className="prop">
        <span>Submit button text</span>
        <input
          type="text"
          value={localize(settings.submitButtonText)}
          placeholder="Submit"
          onChange={(e) => setSettings({ submitButtonText: e.target.value || undefined })}
        />
      </label>

      <label className="prop">
        <span>Confirmation message</span>
        <input
          type="text"
          value={localize(settings.confirmationMessage)}
          placeholder="Thanks!"
          onChange={(e) => setSettings({ confirmationMessage: e.target.value || undefined })}
        />
      </label>
    </div>
  );
}

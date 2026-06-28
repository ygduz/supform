import { languageLabel, localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Outcome, QualityChecks } from "@/types/form-schema";
import { useState } from "react";
import { COMMON_LANGUAGES } from "./languages";

/** Form-level collection settings. Enforced server-side on the public submit endpoint. */
export function SettingsPanel() {
  const { schema, setSettings, setLanguages } = useBuilderStore();
  const settings = schema.settings ?? {};
  const languages = schema.languages ?? [];
  const defaultLanguage = schema.defaultLanguage ?? "en";
  const [newLang, setNewLang] = useState("");
  const [newStep, setNewStep] = useState("");

  const workflowSteps = settings.workflowSteps ?? [];
  const addStep = () => {
    const s = newStep.trim();
    if (!s || workflowSteps.includes(s)) return;
    setSettings({ workflowSteps: [...workflowSteps, s] });
    setNewStep("");
  };
  const removeStep = (s: string) =>
    setSettings({ workflowSteps: workflowSteps.filter((x) => x !== s) });

  const qc = settings.qualityChecks ?? {};
  const setQC = (patch: Partial<QualityChecks>) =>
    setSettings({ qualityChecks: { ...qc, ...patch } });

  const outcomes = settings.outcomes ?? [];
  const setOutcome = (i: number, patch: Partial<Outcome>) =>
    setSettings({ outcomes: outcomes.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
  const addOutcome = () =>
    setSettings({ outcomes: [...outcomes, { min: 0, max: 0, message: "" }] });
  const removeOutcome = (i: number) =>
    setSettings({ outcomes: outcomes.filter((_, idx) => idx !== i) });

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
          <select className="select" value={newLang} onChange={(e) => setNewLang(e.target.value)}>
            <option value="">— pick a language —</option>
            {COMMON_LANGUAGES.filter((l) => !languages.includes(l.code)).map((l) => (
              <option key={l.code} value={l.code}>
                {l.label} ({l.code})
              </option>
            ))}
            <option value="__other__">Other (enter code below)</option>
          </select>
          {newLang === "__other__" && (
            <input
              className="prop-input"
              type="text"
              placeholder="e.g. zu, ps, ky"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setNewLang((e.target as HTMLInputElement).value.trim().toLowerCase());
                  addLanguage();
                }
              }}
              onBlur={(e) => setNewLang(e.target.value.trim().toLowerCase() || "__other__")}
            />
          )}
          <button
            type="button"
            onClick={addLanguage}
            disabled={!newLang.trim() || newLang === "__other__"}
          >
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

      <label className="prop prop-check">
        <input
          type="checkbox"
          checked={settings.acceptingResponses !== false}
          onChange={(e) => setSettings({ acceptingResponses: e.target.checked })}
        />
        <span>Accepting responses</span>
      </label>
      <small className="hint">Turn off to immediately stop collecting new responses.</small>

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

      <label className="prop prop-check">
        <input
          type="checkbox"
          checked={Boolean(settings.shuffleQuestions)}
          onChange={(e) => setSettings({ shuffleQuestions: e.target.checked })}
        />
        <span>Shuffle question order</span>
      </label>

      <label className="prop prop-check">
        <input
          type="checkbox"
          checked={Boolean(settings.shuffleOptions)}
          onChange={(e) => setSettings({ shuffleOptions: e.target.checked })}
        />
        <span>Shuffle answer options</span>
      </label>

      <label className="prop">
        <span>Open date</span>
        <input
          type="datetime-local"
          value={settings.openDate ?? ""}
          onChange={(e) => setSettings({ openDate: e.target.value || undefined })}
        />
        <small className="hint">Before this time the form is not yet accepting responses.</small>
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
        <span>Confirmation title</span>
        <input
          type="text"
          value={localize(settings.confirmationTitle)}
          placeholder="Thank you!"
          onChange={(e) => setSettings({ confirmationTitle: e.target.value || undefined })}
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

      <label className="prop">
        <span>Notify on response</span>
        <input
          type="text"
          value={(settings.notifyEmails ?? []).join(", ")}
          placeholder="you@example.com, team@example.com"
          onChange={(e) => {
            const emails = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            setSettings({ notifyEmails: emails.length ? emails : undefined });
          }}
        />
        <small className="hint">Comma-separated emails alerted on each new response.</small>
      </label>

      <label className="prop">
        <span>Redirect after submit</span>
        <input
          type="url"
          value={settings.redirectUrl ?? ""}
          placeholder="https://example.com/thank-you"
          onChange={(e) => setSettings({ redirectUrl: e.target.value || undefined })}
        />
        <small className="hint">Send respondents here after they submit.</small>
      </label>

      <fieldset className="prop-fieldset">
        <legend>Welcome screen</legend>
        <small className="hint">
          Shown before the first question in paged / one-question-per-screen modes.
        </small>
        <label className="prop">
          <span>Welcome title</span>
          <input
            type="text"
            value={localize(settings.welcomeTitle)}
            placeholder="(optional)"
            onChange={(e) => setSettings({ welcomeTitle: e.target.value || undefined })}
          />
        </label>
        <label className="prop">
          <span>Welcome message</span>
          <input
            type="text"
            value={localize(settings.welcomeMessage)}
            placeholder="(optional)"
            onChange={(e) => setSettings({ welcomeMessage: e.target.value || undefined })}
          />
        </label>
      </fieldset>

      <fieldset className="prop-fieldset">
        <legend>Data quality checks</legend>
        <small className="hint">
          Automatically flag suspicious submissions. Flags appear in the responses table.
        </small>
        <label className="prop">
          <span>Min completion time (seconds)</span>
          <input
            type="number"
            min={0}
            value={qc.minDurationSeconds ?? ""}
            placeholder="30"
            onChange={(e) =>
              setQC({
                minDurationSeconds: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
          <small className="hint">
            Flag as "too fast" if submitted faster than this. Default: 30 s.
          </small>
        </label>
        <div className="prop">
          <span>Expected geo bounding box</span>
          <div className="bbox-row">
            {(["minLat", "minLng", "maxLat", "maxLng"] as const).map((k, i) => (
              <input
                key={k}
                type="number"
                step="any"
                aria-label={k}
                placeholder={k}
                value={qc.expectedGeoBbox?.[i] ?? ""}
                onChange={(e) => {
                  const bbox: [number, number, number, number] = [
                    ...(qc.expectedGeoBbox ?? [0, 0, 0, 0]),
                  ] as [number, number, number, number];
                  bbox[i] = e.target.value === "" ? 0 : Number(e.target.value);
                  setQC({ expectedGeoBbox: bbox });
                }}
              />
            ))}
          </div>
          <small className="hint">
            Flag geopoints outside [minLat, minLng, maxLat, maxLng]. Leave blank to skip.
          </small>
        </div>
      </fieldset>

      <fieldset className="prop-fieldset">
        <legend>Workflow steps</legend>
        <small className="hint">
          Define named stages for reviewing submissions (e.g. "New", "In review", "Approved").
          Manage submissions by step in the Responses → Workflow view.
        </small>
        {workflowSteps.length > 0 && (
          <ul className="lang-list">
            {workflowSteps.map((s) => (
              <li key={s}>
                <span>{s}</span>
                <button type="button" className="link-button" onClick={() => removeStep(s)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="lang-add">
          <input
            className="prop-input"
            type="text"
            placeholder="Step name"
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStep();
              }
            }}
          />
          <button type="button" onClick={addStep} disabled={!newStep.trim()}>
            Add
          </button>
        </div>
      </fieldset>

      <fieldset className="prop-fieldset">
        <legend>Quiz</legend>
        <label className="prop prop-check">
          <input
            type="checkbox"
            checked={Boolean(settings.quizMode)}
            onChange={(e) => setSettings({ quizMode: e.target.checked || undefined })}
          />
          <span>Score answers (quiz mode)</span>
        </label>
        {settings.quizMode && (
          <label className="prop prop-check">
            <input
              type="checkbox"
              checked={settings.showCorrectAnswers !== false}
              onChange={(e) => setSettings({ showCorrectAnswers: e.target.checked })}
            />
            <span>Show respondents their graded results</span>
          </label>
        )}
        {settings.quizMode && (
          <div className="prop">
            <span>Outcomes</span>
            <small className="hint">
              Show a message based on the total score. Mark correct answers and set points in each
              question's settings.
            </small>
            {outcomes.map((o, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: outcomes have no stable id
              <div className="outcome-row" key={i}>
                <input
                  type="number"
                  aria-label="Min score"
                  value={o.min}
                  onChange={(e) => setOutcome(i, { min: Number(e.target.value) })}
                />
                <input
                  type="number"
                  aria-label="Max score"
                  value={o.max}
                  onChange={(e) => setOutcome(i, { max: Number(e.target.value) })}
                />
                <input
                  type="text"
                  aria-label="Outcome message"
                  placeholder="Message"
                  value={localize(o.message)}
                  onChange={(e) => setOutcome(i, { message: e.target.value })}
                />
                <button type="button" className="link-button" onClick={() => removeOutcome(i)}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="link-button" onClick={addOutcome}>
              + Add outcome
            </button>
          </div>
        )}
      </fieldset>
    </div>
  );
}

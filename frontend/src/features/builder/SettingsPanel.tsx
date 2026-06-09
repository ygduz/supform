import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";

/** Form-level collection settings. Enforced server-side on the public submit endpoint. */
export function SettingsPanel() {
  const { schema, setSettings } = useBuilderStore();
  const settings = schema.settings ?? {};

  return (
    <div className="props">
      <h3>Form settings</h3>

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

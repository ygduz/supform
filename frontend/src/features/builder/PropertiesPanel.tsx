import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { isChoiceType } from "./model";

/** Right-hand inspector for editing the currently-selected question. */
export function PropertiesPanel({ element }: { element: Element }) {
  const { update, addOption, updateOption, removeOption } = useBuilderStore();
  const name = element.name;
  const hasOptions = isChoiceType(element.type) || element.type === "rating";

  return (
    <div className="props">
      <h3>Question settings</h3>

      <label className="prop">
        <span>Label</span>
        <input
          type="text"
          value={localize(element.label)}
          onChange={(e) => update(name, { label: e.target.value })}
        />
      </label>

      <label className="prop">
        <span>Help text</span>
        <input
          type="text"
          value={localize(element.hint)}
          placeholder="Optional guidance shown under the question"
          onChange={(e) => update(name, { hint: e.target.value })}
        />
      </label>

      {element.type === "text" || element.type === "longtext" ? (
        <label className="prop">
          <span>Placeholder</span>
          <input
            type="text"
            value={localize(element.placeholder)}
            onChange={(e) => update(name, { placeholder: e.target.value })}
          />
        </label>
      ) : null}

      <label className="prop prop-check">
        <input
          type="checkbox"
          checked={Boolean(element.required)}
          onChange={(e) => update(name, { required: e.target.checked })}
        />
        <span>Required</span>
      </label>

      {hasOptions ? (
        <div className="prop">
          <span>Options</span>
          {(element.options ?? []).map((opt, i) => (
            <div className="option-row" key={`${name}-opt-${String(opt.value)}-${i}`}>
              <input
                type="text"
                value={localize(opt.label) || String(opt.value)}
                onChange={(e) =>
                  updateOption(name, i, {
                    label: e.target.value,
                    value: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                  })
                }
              />
              <button type="button" title="Remove option" onClick={() => removeOption(name, i)}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="link-button" onClick={() => addOption(name)}>
            + Add option
          </button>
        </div>
      ) : null}

      <label className="prop">
        <span>Show this question only if…</span>
        <input
          type="text"
          className="logic-input"
          value={element.visibleIf ?? ""}
          placeholder="e.g. age >= 18"
          onChange={(e) => update(name, { visibleIf: e.target.value || undefined })}
        />
        <small className="hint">
          A logic expression over other questions' names. Leave empty to always show.
        </small>
      </label>
    </div>
  );
}

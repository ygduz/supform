import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import { useState } from "react";
import { findElement } from "./model";

export function ConditionPicker() {
  const schema = useBuilderStore((s) => s.schema);
  const pendingConnection = useBuilderStore((s) => s.pendingConnection);
  const confirmConnect = useBuilderStore((s) => s.confirmConnect);
  const cancelConnect = useBuilderStore((s) => s.cancelConnect);
  const [custom, setCustom] = useState("");

  if (!pendingConnection) return null;

  const src = findElement(schema, pendingConnection.from);
  const tgt = findElement(schema, pendingConnection.to);
  if (!src || !tgt) return null;

  const srcLabel = localize(src.label) || src.name;
  const tgtLabel = localize(tgt.label) || tgt.name;

  const isBoolean = src.type === "boolean";
  const choiceOptions = isBoolean
    ? [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ]
    : (src.options ?? []).map((o) => ({
        value: String(o.value),
        label: localize(o.label) || String(o.value),
      }));
  const hasChoices = choiceOptions.length > 0;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: overlay dismiss on click is supplementary to Cancel button
    <div className="condition-overlay" onClick={() => cancelConnect()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only, no semantic action */}
      <div className="condition-picker" onClick={(e) => e.stopPropagation()}>
        <p className="condition-picker-heading">
          Show <strong>{tgtLabel}</strong> when <strong>{srcLabel}</strong> is…
        </p>

        {hasChoices ? (
          <div className="condition-options">
            {choiceOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="button"
                onClick={() => confirmConnect(opt.value, "==")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="condition-custom">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="value to match (e.g. yes)"
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom) confirmConnect(custom, "==");
              }}
              // biome-ignore lint/a11y/noAutofocus: picker is a transient modal, autofocus is appropriate
              autoFocus
            />
            <button
              type="button"
              className="button"
              disabled={!custom}
              onClick={() => confirmConnect(custom, "==")}
            >
              Apply
            </button>
          </div>
        )}

        <div className="condition-picker-footer">
          <button type="button" className="link-button" onClick={() => cancelConnect()}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

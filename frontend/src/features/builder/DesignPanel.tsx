import { useBuilderStore } from "@/stores/builderStore";
import { useState } from "react";
import { BirdsEyePreview } from "./BirdsEyePreview";
import { FONTS, PRESETS, ThemePanel } from "./ThemePanel";

/**
 * Design rail mode: a live preview alongside quick brand controls (the handoff's swatch/
 * typeface/corner-radius row). Every control here just calls the same `setTheme()` action
 * as the full Theme tab — "More appearance options" embeds that full panel directly, so
 * background color, logo, and reset stay reachable without duplicating their logic.
 */
export function DesignPanel({
  device,
  onOpenFullPreview,
}: {
  device: "desktop" | "mobile";
  onOpenFullPreview: () => void;
}) {
  const { schema, setTheme } = useBuilderStore();
  const theme = schema.theme ?? {};
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="mode-panel design-mode">
      <div className="mode-preview">
        <BirdsEyePreview schema={schema} device={device} onOpenFull={onOpenFullPreview} />
      </div>
      <div className="mode-sidebar">
        <h3>Design</h3>
        <p className="muted">
          Quick brand controls. Everything else — background, logo, and more — is under "More
          appearance options" below.
        </p>

        <div className="prop">
          <span>Brand</span>
          <div className="preset-grid">
            {PRESETS.slice(0, 6).map((p) => (
              <button
                key={p.id}
                type="button"
                className="preset-swatch"
                title={p.name}
                onClick={() => setTheme(p.theme)}
                style={{ background: p.theme.backgroundColor }}
              >
                <span style={{ background: p.theme.primaryColor }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <label className="prop">
          <span>Typeface</span>
          <select
            className="select"
            value={theme.fontFamily ?? ""}
            onChange={(e) => setTheme({ fontFamily: e.target.value })}
          >
            {FONTS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="prop">
          <span>Corner radius: {theme.cornerRadius ?? 10}px</span>
          <input
            type="range"
            min={0}
            max={24}
            value={theme.cornerRadius ?? 10}
            onChange={(e) => setTheme({ cornerRadius: Number(e.target.value) })}
          />
        </label>

        <label className="prop">
          <span>Cover image URL</span>
          <input
            type="text"
            value={theme.coverImage ?? ""}
            placeholder="https://…/cover.jpg"
            onChange={(e) => setTheme({ coverImage: e.target.value })}
          />
        </label>

        <details
          className="design-more"
          open={moreOpen}
          onToggle={(e) => setMoreOpen(e.currentTarget.open)}
        >
          <summary>More appearance options</summary>
          <ThemePanel />
        </details>
      </div>
    </div>
  );
}

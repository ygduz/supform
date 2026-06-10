import { useBuilderStore } from "@/stores/builderStore";
import type { Theme } from "@/types/form-schema";

const FONTS = [
  { label: "Default (Inter)", value: "" },
  { label: "System sans", value: "system-ui, sans-serif" },
  { label: "Serif (Georgia)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "ui-monospace, 'SFMono-Regular', monospace" },
];

/** One-click starting points. Each sets concrete values so the renderer needs no lookup. */
const PRESETS: { id: string; name: string; theme: Theme }[] = [
  {
    id: "ocean",
    name: "Ocean",
    theme: { primaryColor: "#2563eb", backgroundColor: "#ffffff", cornerRadius: 10 },
  },
  {
    id: "forest",
    name: "Forest",
    theme: { primaryColor: "#16a34a", backgroundColor: "#f7fdf9", cornerRadius: 12 },
  },
  {
    id: "sunset",
    name: "Sunset",
    theme: { primaryColor: "#ea580c", backgroundColor: "#fffaf5", cornerRadius: 14 },
  },
  {
    id: "berry",
    name: "Berry",
    theme: { primaryColor: "#db2777", backgroundColor: "#fff7fb", cornerRadius: 16 },
  },
  {
    id: "midnight",
    name: "Midnight",
    theme: { primaryColor: "#6366f1", backgroundColor: "#0f172a", cornerRadius: 10 },
  },
  {
    id: "slate",
    name: "Slate",
    theme: { primaryColor: "#0f172a", backgroundColor: "#f8fafc", cornerRadius: 6 },
  },
  {
    id: "mono",
    name: "Mono",
    theme: {
      primaryColor: "#111827",
      backgroundColor: "#ffffff",
      cornerRadius: 2,
      fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
    },
  },
  {
    id: "warm",
    name: "Warm",
    theme: {
      primaryColor: "#b45309",
      backgroundColor: "#fffbeb",
      cornerRadius: 12,
      fontFamily: "Georgia, 'Times New Roman', serif",
    },
  },
];

/** Form-level design controls. Edits live in `schema.theme` and apply to the live preview. */
export function ThemePanel() {
  const { schema, setTheme } = useBuilderStore();
  const theme = schema.theme ?? {};

  return (
    <div className="props">
      <h3>Theme</h3>

      <div className="prop">
        <span>Presets</span>
        <div className="preset-grid">
          {PRESETS.map((p) => (
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

      <label className="prop prop-color">
        <span>Primary color</span>
        <input
          type="color"
          value={theme.primaryColor ?? "#2563eb"}
          onChange={(e) => setTheme({ primaryColor: e.target.value })}
        />
      </label>

      <label className="prop prop-color">
        <span>Background</span>
        <input
          type="color"
          value={theme.backgroundColor ?? "#ffffff"}
          onChange={(e) => setTheme({ backgroundColor: e.target.value })}
        />
      </label>

      <label className="prop">
        <span>Font</span>
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
        <span>Logo URL</span>
        <input
          type="text"
          value={theme.logo ?? ""}
          placeholder="https://…/logo.png"
          onChange={(e) => setTheme({ logo: e.target.value })}
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

      <button
        type="button"
        className="link-button"
        onClick={() =>
          setTheme({
            primaryColor: undefined,
            backgroundColor: undefined,
            fontFamily: undefined,
            cornerRadius: undefined,
            logo: undefined,
            coverImage: undefined,
          })
        }
      >
        Reset to defaults
      </button>
    </div>
  );
}

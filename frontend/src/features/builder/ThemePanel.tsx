import { useBuilderStore } from "@/stores/builderStore";

const FONTS = [
  { label: "Default (Inter)", value: "" },
  { label: "System sans", value: "system-ui, sans-serif" },
  { label: "Serif (Georgia)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "ui-monospace, 'SFMono-Regular', monospace" },
];

/** Form-level design controls. Edits live in `schema.theme` and apply to the live preview. */
export function ThemePanel() {
  const { schema, setTheme } = useBuilderStore();
  const theme = schema.theme ?? {};

  return (
    <div className="props">
      <h3>Theme</h3>

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

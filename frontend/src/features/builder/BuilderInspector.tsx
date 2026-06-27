import { Button } from "@/components";
import type { Element, FormSchema } from "@/types/form-schema";
import { ActivityPanel } from "./ActivityPanel";
import { BirdsEyePreview } from "./BirdsEyePreview";
import { Chevron } from "./Chevron";
import { HistoryPanel } from "./HistoryPanel";
import { OverviewPanel } from "./OverviewPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ThemePanel } from "./ThemePanel";
import { TranslatePanel } from "./TranslatePanel";

export type Tab =
  | "overview"
  | "properties"
  | "theme"
  | "settings"
  | "translate"
  | "preview"
  | "history"
  | "activity";

const TAB_TITLES: Record<Tab, string> = {
  overview: "Overview — all fields at a glance",
  properties: "Properties — edit this field",
  theme: "Theme — colours & fonts",
  settings: "Settings — form behaviour",
  translate: "Translations",
  preview: "Live preview",
  history: "History — session edits & published versions",
  activity: "Activity log",
};

const TAB_LABELS: Partial<Record<Tab, string>> = {
  overview: "Map",
  translate: "🌐",
  history: "History",
  activity: "Activity",
  preview: "Live",
};

function tabLabel(t: Tab): string {
  return TAB_LABELS[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

/** The horizontal tab button row. */
function TabStrip({ tab, setTab, tabs }: { tab: Tab; setTab: (t: Tab) => void; tabs: Tab[] }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <Button
          key={t}
          variant="ghost"
          size="sm"
          className={tab === t ? "tab active" : "tab"}
          onClick={() => setTab(t)}
          title={TAB_TITLES[t]}
        >
          {tabLabel(t)}
        </Button>
      ))}
    </div>
  );
}

interface Props {
  open: boolean;
  setOpen: (fn: (o: boolean) => boolean) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  isMultilingual: boolean;
  formId: string;
  selected: Element | null;
  schema: FormSchema;
  onOpenPreview: () => void;
  onRestoreVersion: (version: number) => void;
}

/**
 * Right sidebar: collapse toggle, the tab strip, and the active tab's panel
 * (Map / Properties / Theme / Settings / Translate / Live / History / Activity).
 */
export function BuilderInspector({
  open,
  setOpen,
  tab,
  setTab,
  isMultilingual,
  formId,
  selected,
  schema,
  onOpenPreview,
  onRestoreVersion,
}: Props) {
  const tabs: Tab[] = [
    "overview",
    "properties",
    "theme",
    "settings",
    ...(isMultilingual ? (["translate"] as Tab[]) : []),
    "preview",
    "history",
    ...(formId !== "new" ? (["activity"] as Tab[]) : []),
  ];

  return (
    <aside className={`inspector${open ? "" : " inspector-collapsed"}`}>
      <button
        type="button"
        className="panel-toggle"
        title={open ? "Collapse inspector" : "Expand inspector"}
        aria-label={open ? "Collapse inspector" : "Expand inspector"}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="panel-toggle-chip" aria-hidden="true">
          <Chevron dir={open ? "right" : "left"} />
        </span>
      </button>
      <div className="inspector-inner">
        <TabStrip tab={tab} setTab={setTab} tabs={tabs} />

        {tab === "overview" && <OverviewPanel />}
        {tab === "properties" &&
          (selected ? (
            <PropertiesPanel element={selected} />
          ) : (
            <p className="muted">Select a question to edit its settings.</p>
          ))}
        {tab === "theme" && <ThemePanel />}
        {tab === "settings" && <SettingsPanel />}
        {tab === "translate" && <TranslatePanel />}
        {tab === "preview" && <BirdsEyePreview schema={schema} onOpenFull={onOpenPreview} />}
        {tab === "activity" && formId !== "new" && <ActivityPanel formId={formId} />}
        {tab === "history" && <HistoryPanel formId={formId} onRestoreVersion={onRestoreVersion} />}
      </div>
    </aside>
  );
}

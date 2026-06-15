import type { ReactNode } from "react";

interface Tab {
  key: string;
  label: ReactNode;
  /** Optional count bubble. */
  count?: number;
}

interface Props {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className = "" }: Props) {
  return (
    <div className={`tabs ${className}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          className={`tab ${active === t.key ? "tab--active" : ""}`}
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

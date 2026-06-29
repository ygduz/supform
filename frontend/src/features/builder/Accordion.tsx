import { type ReactNode, useState } from "react";

/**
 * A collapsible inspector section (progressive disclosure): a header you click to expand,
 * with an optional summary chip shown while collapsed so the section stays scannable.
 * Open/closed state persists per `sectionKey` in localStorage so it survives reselecting a
 * question or reloading the builder.
 */
export function Accordion({
  sectionKey,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  /** Stable key used to persist the open/closed state (e.g. "props.validation"). */
  sectionKey: string;
  title: string;
  /** Short text shown on the right of the header while collapsed (e.g. "2 rules"). */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const storageKey = `acc:${sectionKey}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return defaultOpen;
    const saved = localStorage.getItem(storageKey);
    return saved === null ? defaultOpen : saved === "1";
  });

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* storage may be unavailable (private mode) — non-fatal */
      }
      return next;
    });
  };

  return (
    <section className={`acc${open ? " open" : ""}`}>
      <button type="button" className="acc-header" aria-expanded={open} onClick={toggle}>
        <span className="acc-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="acc-title">{title}</span>
        {!open && summary && <span className="acc-summary">{summary}</span>}
      </button>
      {open && <div className="acc-body">{children}</div>}
    </section>
  );
}

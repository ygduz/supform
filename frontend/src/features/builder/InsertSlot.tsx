import { useBuilderStore } from "@/stores/builderStore";
import type { ElementType } from "@/types/form-schema";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DropLocation } from "./BuilderCanvas";
import { ELEMENT_PALETTE } from "./palette";

const CATEGORIES: { label: string; types: ElementType[] }[] = [
  {
    label: "Basic",
    types: [
      "text",
      "longtext",
      "email",
      "phone",
      "url",
      "number",
      "integer",
      "decimal",
      "date",
      "date_range",
      "time",
      "datetime",
    ],
  },
  {
    label: "Choice",
    types: [
      "single_choice",
      "multi_choice",
      "dropdown",
      "boolean",
      "rating",
      "scale",
      "ranking",
      "matrix",
    ],
  },
  {
    label: "Layout",
    types: ["group", "repeat", "note", "html"],
  },
  {
    label: "Advanced",
    types: [
      "signature",
      "address",
      "file",
      "image",
      "geopoint",
      "geotrace",
      "geoshape",
      "barcode",
      "calculated",
      "start",
      "end",
      "today",
      "deviceid",
      "username",
    ],
  },
];

/**
 * The thin gap between two canvas cards. Hovering reveals a ➕ button; clicking it opens
 * an in-place question-type picker that inserts at exactly this position — the fastest
 * way to build without reaching for the left palette. The picker groups types into
 * categories (Basic/Choice/Layout/Advanced) with a search box on top for fast filtering.
 */
export function InsertSlot({
  location,
  variant = "gap",
  label = "Add question",
}: {
  location: DropLocation;
  /** "gap" = thin hover-reveal between cards; "block" = persistent full-width button. */
  variant?: "gap" | "block";
  label?: string;
}) {
  const addAt = useBuilderStore((s) => s.addAt);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    // Autofocus the search box the moment the popover opens.
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const insert = (type: ElementType) => {
    addAt(type, { pageIndex: location.pageIndex, parentName: location.parentName }, location.index);
    setOpen(false);
  };

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATEGORIES.map((cat) => {
      const items = cat.types
        .map((type) => ELEMENT_PALETTE.find((p) => p.type === type))
        .filter((item): item is { type: ElementType; label: string; icon: string } => !!item)
        .filter((item) => !q || item.label.toLowerCase().includes(q) || item.type.includes(q));
      return { ...cat, items };
    }).filter((cat) => cat.items.length > 0);
  }, [query]);

  return (
    <div
      ref={ref}
      className={`${variant === "block" ? "insert-block" : "insert-slot"}${open ? " open" : ""}`}
    >
      {variant === "block" ? (
        <button type="button" className="insert-block-btn" onClick={() => setOpen((v) => !v)}>
          <span aria-hidden="true">＋</span> {label}
        </button>
      ) : (
        <button
          type="button"
          className="insert-btn"
          title="Insert a question here"
          onClick={() => setOpen((v) => !v)}
        >
          +
        </button>
      )}
      {open && (
        <div className="insert-pop insert-pop-grouped" role="menu">
          <input
            ref={searchRef}
            type="text"
            className="insert-search"
            placeholder="Search question types…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <div className="insert-pop-scroll">
            {filteredCategories.length === 0 && <p className="insert-no-results">No matches</p>}
            {filteredCategories.map((cat) => (
              <div key={cat.label} className="insert-category">
                <span className="insert-category-label">{cat.label}</span>
                {cat.items.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    role="menuitem"
                    onClick={() => insert(item.type)}
                  >
                    <span aria-hidden="true">{item.icon}</span> {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

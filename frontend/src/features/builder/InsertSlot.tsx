import { useBuilderStore } from "@/stores/builderStore";
import { useEffect, useRef, useState } from "react";
import type { DropLocation } from "./BuilderCanvas";
import { ELEMENT_PALETTE } from "./palette";

/**
 * The thin gap between two canvas cards. Hovering reveals a ➕ button; clicking it opens
 * an in-place question-type picker that inserts at exactly this position — the fastest
 * way to build without reaching for the left palette.
 */
export function InsertSlot({ location }: { location: DropLocation }) {
  const addAt = useBuilderStore((s) => s.addAt);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`insert-slot${open ? " open" : ""}`}>
      <button
        type="button"
        className="insert-btn"
        title="Insert a question here"
        onClick={() => setOpen((v) => !v)}
      >
        +
      </button>
      {open && (
        <div className="insert-pop" role="menu">
          {ELEMENT_PALETTE.map((item) => (
            <button
              key={item.type}
              type="button"
              role="menuitem"
              onClick={() => {
                addAt(item.type, { pageIndex: location.pageIndex, parentName: location.parentName }, location.index);
                setOpen(false);
              }}
            >
              <span aria-hidden="true">{item.icon}</span> {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

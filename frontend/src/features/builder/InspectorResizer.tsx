import { useEffect } from "react";

const MIN = 300;
const MAX = 520;
const VAR = "--inspector-w";
const STORE = "supform:inspectorWidth";

/** Apply a clamped width to the builder grid via a CSS custom property on :root. */
function applyWidth(px: number) {
  const w = Math.min(MAX, Math.max(MIN, px));
  document.documentElement.style.setProperty(VAR, `${w}px`);
}

/**
 * A drag handle on the inspector's left edge: drag to resize the panel (300–520px). The
 * width is stored as a CSS variable the `.builder-body` grid reads, and persisted to
 * localStorage so it sticks across reloads.
 */
export function InspectorResizer() {
  // Restore the saved width on mount.
  useEffect(() => {
    const saved = Number(localStorage.getItem(STORE));
    if (saved >= MIN && saved <= MAX) applyWidth(saved);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.classList.add("inspector-resizing");

    const move = (ev: PointerEvent) => {
      // The inspector is right-anchored, so width grows as the pointer moves left.
      applyWidth(window.innerWidth - ev.clientX);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("inspector-resizing");
      const current = getComputedStyle(document.documentElement).getPropertyValue(VAR).trim();
      const px = Number.parseInt(current, 10);
      if (px) localStorage.setItem(STORE, String(px));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowLeft" ? 16 : e.key === "ArrowRight" ? -16 : 0;
    if (!step) return;
    e.preventDefault();
    const current = getComputedStyle(document.documentElement).getPropertyValue(VAR).trim();
    const px = Number.parseInt(current, 10) || 360;
    const next = Math.min(MAX, Math.max(MIN, px + step));
    applyWidth(next);
    localStorage.setItem(STORE, String(next));
  };

  return (
    <div
      className="inspector-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
      title="Drag to resize (or focus and use arrow keys)"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

import { useRef, useState } from "react";

type Tone = "success" | "danger";
interface ToastState {
  msg: string;
  tone: Tone;
}

/**
 * Transient toast notifications for the builder. Returns the current toast (or null),
 * a `showToast(msg, tone)` trigger that auto-dismisses after 4s, and a manual `dismiss`.
 * Render the returned state with <Toast/>.
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, tone: Tone = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, tone });
    timer.current = setTimeout(() => setToast(null), 4000);
  };

  return { toast, showToast, dismiss: () => setToast(null) };
}

/** Presentational toast banner. Renders nothing when there is no active toast. */
export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <output className={`builder-toast builder-toast--${toast.tone}`} aria-live="polite">
      <span>{toast.msg}</span>
      <button
        type="button"
        className="builder-toast-close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </output>
  );
}

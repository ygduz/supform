import type { ReactNode } from "react";
import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Extra class on the dialog box itself. */
  className?: string;
  /** Width preset. Default "md". */
  width?: "sm" | "md" | "lg" | "xl";
  /** Don't show the header close (×) button. */
  hideClose?: boolean;
}

const WIDTHS: Record<string, string> = {
  sm: "modal--sm",
  md: "",
  lg: "modal--lg",
  xl: "modal--xl",
};

export function Modal({
  open,
  onClose,
  title,
  children,
  className = "",
  width = "md",
  hideClose = false,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <dialog
        open
        className={`modal-box ${WIDTHS[width]} ${className}`}
        aria-labelledby={title ? "modal-title" : undefined}
      >
        {(title || !hideClose) && (
          <div className="modal-header">
            {title && (
              <h2 className="modal-title" id="modal-title">
                {title}
              </h2>
            )}
            {!hideClose && (
              <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
                ×
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
      </dialog>
    </div>
  );
}

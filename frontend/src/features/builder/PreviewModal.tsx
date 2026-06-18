import { FormRenderer } from "@/features/renderer/FormRenderer";
import type { FormSchema } from "@/types/form-schema";
import { useEffect } from "react";

interface Props {
  schema: FormSchema;
  onClose: () => void;
}

export function PreviewModal({ schema, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="presentation"
    >
      <dialog
        className="modal-box preview-modal-box"
        open
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label="Form preview"
      >
        <div className="preview-modal-header">
          <span className="preview-modal-title">Preview</span>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>
        <div className="preview-modal-body">
          <FormRenderer schema={schema} formId="preview" />
        </div>
      </dialog>
    </div>
  );
}

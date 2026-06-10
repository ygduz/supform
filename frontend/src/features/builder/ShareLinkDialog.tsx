import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

/**
 * Distribution options for a published form: the public link, an embed snippet, and a
 * scannable QR code. Opened from the builder's "Share link" button.
 */
export function ShareLinkDialog({ formId, onClose }: { formId: string; onClose: () => void }) {
  const origin = window.location.origin;
  const link = `${origin}/f/${formId}`;
  const embed = `<div data-supform="${formId}"></div>\n<script src="${origin}/embed.js" async></script>`;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, link, { width: 160, margin: 1 }).catch(() => {});
    }
  }, [link]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="modal-backdrop">
      <button
        type="button"
        className="modal-backdrop-close"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="modal share-link-dialog">
        <header className="modal-head">
          <h2>Share your form</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </header>

        <label className="prop">
          <span>Public link</span>
          <div className="copy-row">
            <input type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button type="button" onClick={() => copy(link, "link")}>
              {copied === "link" ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </label>

        <label className="prop">
          <span>Embed on your site</span>
          <textarea className="embed-snippet" readOnly rows={3} value={embed} />
          <button type="button" className="link-button" onClick={() => copy(embed, "embed")}>
            {copied === "embed" ? "Copied ✓" : "Copy embed code"}
          </button>
        </label>

        <div className="prop qr-block">
          <span>QR code</span>
          <canvas ref={canvasRef} className="qr-canvas" />
        </div>
      </div>
    </div>
  );
}

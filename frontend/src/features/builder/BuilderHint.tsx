/** Dismissible one-line onboarding hint shown under the toolbar. */
export function BuilderHint({
  dismissed,
  onDismiss,
}: { dismissed: boolean; onDismiss: () => void }) {
  if (dismissed) return null;
  return (
    <div className="builder-hint">
      <span>
        <strong>1.</strong> Add a question · <strong>2.</strong> Preview · <strong>3.</strong>{" "}
        Publish &amp; share. Press <kbd>?</kbd> for shortcuts.
      </span>
      <button type="button" className="builder-hint-close" aria-label="Dismiss" onClick={onDismiss}>
        ✕
      </button>
    </div>
  );
}

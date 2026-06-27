import { Modal } from "@/components";

/** Keyboard-shortcuts reference, opened with "?" or the help affordance. */
export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" width="sm">
      <dl className="shortcuts-list">
        <div>
          <dt>Ctrl/⌘ + Z</dt>
          <dd>Undo</dd>
        </div>
        <div>
          <dt>Ctrl/⌘ + Shift + Z</dt>
          <dd>Redo</dd>
        </div>
        <div>
          <dt>Ctrl/⌘ + D</dt>
          <dd>Duplicate selection</dd>
        </div>
        <div>
          <dt>Ctrl/⌘ + G</dt>
          <dd>Group selected questions</dd>
        </div>
        <div>
          <dt>Ctrl/⌘ + A</dt>
          <dd>Select all on page</dd>
        </div>
        <div>
          <dt>Delete / Backspace</dt>
          <dd>Remove selection</dd>
        </div>
        <div>
          <dt>Esc</dt>
          <dd>Clear selection</dd>
        </div>
        <div>
          <dt>?</dt>
          <dd>Toggle this help</dd>
        </div>
      </dl>
    </Modal>
  );
}

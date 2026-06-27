import { useBuilderStore } from "@/stores/builderStore";
import { PreviewModal } from "./PreviewModal";
import { ShareDialog } from "./ShareDialog";
import { ShortcutsModal } from "./ShortcutsModal";
import { WebhooksDialog } from "./WebhooksDialog";

interface Props {
  previewOpen: boolean;
  onClosePreview: () => void;
  shareTab: "link" | "people" | null;
  onCloseShare: () => void;
  integrations: boolean;
  onCloseIntegrations: () => void;
  shortcutsOpen: boolean;
  onCloseShortcuts: () => void;
}

/**
 * The builder's overlay dialogs, each shown by its own flag: full-screen preview,
 * the Share dialog (link/people), the integrations (webhooks) dialog, and the
 * keyboard-shortcuts help. Reads the form/project ids and schema from the store.
 */
export function BuilderModals({
  previewOpen,
  onClosePreview,
  shareTab,
  onCloseShare,
  integrations,
  onCloseIntegrations,
  shortcutsOpen,
  onCloseShortcuts,
}: Props) {
  const store = useBuilderStore();
  return (
    <>
      {previewOpen && <PreviewModal schema={store.schema} onClose={onClosePreview} />}
      {shareTab && (
        <ShareDialog
          formId={store.formId ?? undefined}
          projectId={store.projectId ?? undefined}
          initialTab={shareTab}
          onClose={onCloseShare}
        />
      )}
      {integrations && store.formId && (
        <WebhooksDialog formId={store.formId} onClose={onCloseIntegrations} />
      )}
      <ShortcutsModal open={shortcutsOpen} onClose={onCloseShortcuts} />
    </>
  );
}

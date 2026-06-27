import { api } from "@/api/client";
import { Button } from "@/components";
import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { ElementType } from "@/types/form-schema";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BuilderCanvas } from "./BuilderCanvas";
import { BuilderHint } from "./BuilderHint";
import { BuilderInspector, type Tab } from "./BuilderInspector";
import { BuilderModals } from "./BuilderModals";
import { BuilderPalette } from "./BuilderPalette";
import { BuilderToolbar } from "./BuilderToolbar";
import { DragGhost } from "./DragGhost";
import { LogicBuilder } from "./LogicBuilder";
import { findElement, pageElements } from "./model";
import { ELEMENT_PALETTE } from "./palette";
import { useBuilderDrag } from "./useBuilderDrag";
import { useBuilderShortcuts } from "./useBuilderShortcuts";
import { Toast, useToast } from "./useToast";

export function BuilderPage() {
  const { formId = "new" } = useParams();
  const navigate = useNavigate();
  const store = useBuilderStore();
  const init = useBuilderStore((s) => s.init);
  const { schema, selectedName, selectedNames, activePage, dirty } = store;
  const [tab, setTab] = useState<Tab>("overview");
  const [shareTab, setShareTab] = useState<"link" | "people" | null>(null);
  const [integrations, setIntegrations] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [hintDismissed, setHintDismissed] = useState(
    () => localStorage.getItem("supform.builderHintDismissed") === "1",
  );
  const { toast, showToast, dismiss: dismissToast } = useToast();
  const isMultilingual = (schema.languages?.length ?? 0) >= 2;

  // When a card is selected, surface its settings without requiring a manual tab switch.
  useEffect(() => {
    if (selectedName) setTab("properties");
  }, [selectedName]);

  // ---- group-link mode ----
  // null = not active; string = the name of the card that initiated grouping
  const [groupingSource, setGroupingSource] = useState<string | null>(null);

  // ---- drag & drop (sensors, collision detection, start/over/end handlers) ----
  const {
    sensors,
    collisionDetection,
    activeDragId,
    overDragId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useBuilderDrag();

  useEffect(() => {
    init(formId);
  }, [formId, init]);

  useEffect(() => {
    if (store.formId && store.formId !== formId) {
      navigate(`/builder/${store.formId}`, { replace: true });
    }
  }, [store.formId, formId, navigate]);

  // Loss-aversion guard: warn before leaving with unsaved edits. Autosave usually beats
  // this, but a fast close/refresh can still race the 2s autosave timer.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useBuilderShortcuts({
    shortcutsOpen,
    setShortcutsOpen,
    closeShortcuts: () => setShortcutsOpen(false),
    groupingSource,
    clearGroupingSource: () => setGroupingSource(null),
  });

  const elements = pageElements(schema, activePage);
  const selected = selectedName ? findElement(schema, selectedName) : null;

  // Clicking the empty canvas background (not a card or interactive control) clears the
  // selection — the "click away to deselect" convention every design tool follows. Card
  // clicks and control clicks are excluded so they keep their own behavior.
  function handleCanvasBackgroundClick(e: React.MouseEvent) {
    // Connector-drawing and group-link modes own their own click handling; don't interfere.
    if (groupingSource || store.connectingFrom) return;
    const t = e.target as HTMLElement;
    if (t.closest(".el-card") || t.closest("button, input, textarea, select, a, label")) return;
    if (selectedName || selectedNames.size > 0) store.clearSelection();
  }

  // Active drag ghost content (for the overlay).
  const activePaletteType = activeDragId?.startsWith("palette:")
    ? (activeDragId.slice("palette:".length) as ElementType)
    : null;
  const activePaletteItem = activePaletteType
    ? ELEMENT_PALETTE.find((p) => p.type === activePaletteType)
    : null;
  const activeCanvasElement =
    activeDragId && !activeDragId.startsWith("palette:") ? findElement(schema, activeDragId) : null;

  return (
    <div className="builder">
      <BuilderToolbar
        onShare={setShareTab}
        onIntegrations={() => setIntegrations(true)}
        onPreview={() => setPreviewOpen(true)}
        showToast={showToast}
      />

      <BuilderHint
        dismissed={hintDismissed}
        onDismiss={() => {
          localStorage.setItem("supform.builderHintDismissed", "1");
          setHintDismissed(true);
        }}
      />

      {/* One DndContext covers both the palette (useDraggable) and the canvas (useSortable). */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          className={`builder-body${paletteOpen ? "" : " palette-collapsed"}${inspectorOpen ? "" : " inspector-collapsed"}`}
        >
          {/* Palette */}
          <BuilderPalette
            open={paletteOpen}
            setOpen={setPaletteOpen}
            showLibrary={showLibrary}
            setShowLibrary={setShowLibrary}
          />

          {/* Canvas */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: click-to-deselect duplicates the Esc handler */}
          <section
            className={`canvas${groupingSource ? " linking" : ""}`}
            onClick={handleCanvasBackgroundClick}
          >
            <div className="page-bar">
              {schema.pages.map((p, i) => (
                <Button
                  key={p.name}
                  variant="ghost"
                  size="sm"
                  className={i === activePage ? "page-tab active" : "page-tab"}
                  onClick={() => store.setActivePage(i)}
                >
                  {localize(p.title) || `Page ${i + 1}`}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="page-add"
                onClick={() => store.addPage()}
              >
                + Page
              </Button>
            </div>

            {schema.pages.length > 1 && (
              <div className="page-settings">
                <div className="page-settings-row">
                  <input
                    type="text"
                    aria-label="Page title"
                    value={localize(schema.pages[activePage]?.title) || ""}
                    placeholder={`Page ${activePage + 1}`}
                    onChange={(e) => store.renamePage(activePage, e.target.value)}
                  />
                  <Button variant="danger" size="sm" onClick={() => store.removePage(activePage)}>
                    Delete page
                  </Button>
                </div>
                <LogicBuilder
                  label="Show this page only if…"
                  value={schema.pages[activePage]?.visibleIf}
                  excludeName=""
                  onChange={(v) => store.setPageVisibleIf(activePage, v)}
                />
                <div className="page-branching">
                  <div className="page-branching-header">
                    <span className="page-branching-label">Page branching</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const current = schema.pages[activePage]?.nextPageIf ?? [];
                        store.setPageNextPageIf(activePage, [
                          ...current,
                          { condition: "", page: schema.pages[activePage + 1]?.name ?? "" },
                        ]);
                      }}
                    >
                      + Add rule
                    </Button>
                  </div>
                  {(schema.pages[activePage]?.nextPageIf ?? []).length > 0 && (
                    <div className="page-branching-rules">
                      {(schema.pages[activePage]?.nextPageIf ?? []).map((rule, ri) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: branching rules have no stable id
                        <div key={ri} className="page-branching-rule">
                          <LogicBuilder
                            label="If…"
                            value={rule.condition}
                            excludeName=""
                            onChange={(v) => {
                              const rules = [...(schema.pages[activePage]?.nextPageIf ?? [])];
                              rules[ri] = { ...rules[ri], condition: v ?? "" };
                              store.setPageNextPageIf(activePage, rules);
                            }}
                          />
                          <div className="page-branching-target">
                            {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps select below */}
                            <label className="page-branching-target-label">Go to page</label>
                            <select
                              value={rule.page}
                              onChange={(e) => {
                                const rules = [...(schema.pages[activePage]?.nextPageIf ?? [])];
                                rules[ri] = { ...rules[ri], page: e.target.value };
                                store.setPageNextPageIf(activePage, rules);
                              }}
                            >
                              {schema.pages
                                .filter((_, pi) => pi !== activePage)
                                .map((p) => (
                                  <option key={p.name} value={p.name}>
                                    {p.name}
                                  </option>
                                ))}
                            </select>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const rules = (schema.pages[activePage]?.nextPageIf ?? []).filter(
                                  (_, i) => i !== ri,
                                );
                                store.setPageNextPageIf(activePage, rules);
                              }}
                            >
                              ✕
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {elements.length === 0 ? (
              <div className="canvas-empty">
                <div className="canvas-empty-icon" aria-hidden="true">
                  ⊕
                </div>
                <p className="canvas-empty-heading">Start building your form</p>
                <p className="canvas-empty-body">
                  Click a field type in the left panel to add it, or drag one onto the canvas.
                </p>
              </div>
            ) : (
              <BuilderCanvas
                elements={elements}
                pageIndex={activePage}
                activeDragId={activeDragId}
                overDragId={overDragId}
                groupingSource={groupingSource}
                onGroupLink={(name) => {
                  if (groupingSource === null) {
                    // Enter group-link mode.
                    setGroupingSource(name);
                    store.select(name);
                  } else if (groupingSource !== name) {
                    // Complete the group.
                    store.confirmGrouping(groupingSource, name);
                    setGroupingSource(null);
                  }
                }}
              />
            )}
          </section>

          {/* Inspector */}
          <BuilderInspector
            open={inspectorOpen}
            setOpen={setInspectorOpen}
            tab={tab}
            setTab={setTab}
            isMultilingual={isMultilingual}
            formId={formId}
            selected={selected}
            schema={schema}
            onOpenPreview={() => setPreviewOpen(true)}
            onRestoreVersion={async (version) => {
              const versionSchema = await api.getVersion(formId, version);
              store.loadTemplate(versionSchema);
              await store.save();
            }}
          />
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.3,1)" }}>
          <DragGhost paletteItem={activePaletteItem} canvasElement={activeCanvasElement} />
        </DragOverlay>
      </DndContext>

      <BuilderModals
        previewOpen={previewOpen}
        onClosePreview={() => setPreviewOpen(false)}
        shareTab={shareTab}
        onCloseShare={() => setShareTab(null)}
        integrations={integrations}
        onCloseIntegrations={() => setIntegrations(false)}
        shortcutsOpen={shortcutsOpen}
        onCloseShortcuts={() => setShortcutsOpen(false)}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

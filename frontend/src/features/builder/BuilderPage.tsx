import { api } from "@/api/client";
import { Button, Modal } from "@/components";
import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { ElementType, FormSchema } from "@/types/form-schema";
import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formToText } from "../import/textForm";
import { saveMyTemplate } from "../templates/myTemplates";
import { ActivityPanel } from "./ActivityPanel";
import { BirdsEyePreview } from "./BirdsEyePreview";
import { BuilderCanvas, type DropLocation } from "./BuilderCanvas";
import { HistoryPanel } from "./HistoryPanel";
import { LogicBuilder } from "./LogicBuilder";
import { OverviewPanel } from "./OverviewPanel";
import { PaletteItem } from "./PaletteItem";
import { PreviewModal } from "./PreviewModal";
import { PropertiesPanel } from "./PropertiesPanel";
import { QuestionLibraryPanel } from "./QuestionLibraryPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ShareDialog } from "./ShareDialog";
import { ShareLinkDialog } from "./ShareLinkDialog";
import { ThemePanel } from "./ThemePanel";
import { TranslatePanel } from "./TranslatePanel";
import { WebhooksDialog } from "./WebhooksDialog";
import { confirmDeleteContainer, findElement, isContainerType, pageElements } from "./model";
import { ADVANCED_PALETTE, COMMON_PALETTE, ELEMENT_PALETTE } from "./palette";

type Tab =
  | "overview"
  | "properties"
  | "theme"
  | "settings"
  | "translate"
  | "preview"
  | "history"
  | "activity";

/** Rightward drag distance (px) that turns a card-on-card drop into a grouping action. */
const GROUP_NUDGE_PX = 48;

/** Crisp stroked chevron for the panel collapse toggles — replaces the thin ‹/› glyph. */
function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      className="panel-toggle-chevron"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

export function BuilderPage() {
  const { formId = "new" } = useParams();
  const navigate = useNavigate();
  const store = useBuilderStore();
  const init = useBuilderStore((s) => s.init);
  const { schema, selectedName, selectedNames, activePage, status, error, dirty } = store;
  const [tab, setTab] = useState<Tab>("overview");
  const [sharing, setSharing] = useState(false);
  const [shareLink, setShareLink] = useState(false);
  const [integrations, setIntegrations] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [hintDismissed, setHintDismissed] = useState(
    () => localStorage.getItem("supform.builderHintDismissed") === "1",
  );
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "danger" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string, tone: "success" | "danger" = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, tone });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };
  const importRef = useRef<HTMLInputElement>(null);
  const isMultilingual = (schema.languages?.length ?? 0) >= 2;

  // When a card is selected, surface its settings without requiring a manual tab switch.
  useEffect(() => {
    if (selectedName) setTab("properties");
  }, [selectedName]);

  // ---- drag state (shared across palette + canvas) ----
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overDragId, setOverDragId] = useState<string | null>(null);

  // ---- group-link mode ----
  // null = not active; string = the name of the card that initiated grouping
  const [groupingSource, setGroupingSource] = useState<string | null>(null);
  // Pointer position where the drag began (from the activator pointerdown). The drag end
  // event omits pointer coords, so we reconstruct the live pointer as start + delta.
  const dragStartPoint = useRef<{ x: number; y: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Pointer-first collision detection: what's directly under the cursor wins. This makes
  // dropping a question *out* of a section (onto the page-level drop zone or another
  // top-level card) reliable — closestCorners alone tends to snap back to the nested
  // SortableContext whose rect overlaps the pointer. Falls back to rect-based strategies
  // when the pointer isn't over any droppable (e.g. fast drags past the edge).
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const byPointer = pointerWithin(args);
    if (byPointer.length > 0) return byPointer;
    const byRect = rectIntersection(args);
    if (byRect.length > 0) return byRect;
    return closestCorners(args);
  }, []);

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveDragId(id);
    const ae = e.activatorEvent as { clientX?: number; clientY?: number };
    dragStartPoint.current =
      ae.clientX !== undefined && ae.clientY !== undefined
        ? { x: ae.clientX, y: ae.clientY }
        : null;
    // Select the element being dragged (not for palette items).
    if (!id.startsWith("palette:")) store.select(id);
  }

  function handleDragOver(e: DragOverEvent) {
    setOverDragId(e.over ? String(e.over.id) : null);
    // Broadcast whether releasing now would GROUP, so the hovered card shows the cue.
    const target = groupDropTarget(e);
    store.setDropTarget(target, target ? "group" : "move");
  }

  /**
   * The question card a release would GROUP with, or null when the drop should reorder.
   *
   * Grouping intent is a *rightward nudge* onto another card (like indent-to-nest in an
   * outliner). We key off horizontal drag distance rather than a vertical "centre band"
   * because dnd-kit's sortable shifts cards vertically under the cursor mid-drag, which
   * makes any vertical hit-test unreliable — horizontal delta is unaffected by that shift.
   * The target card is hit-tested from the live pointer (activator event + delta).
   */
  function groupDropTarget(e: DragOverEvent | DragEndEvent): string | null {
    const activeId = String(e.active.id);
    if (activeId.startsWith("palette:")) return null;
    if (e.delta.x < GROUP_NUDGE_PX) return null; // not a deliberate sideways nudge → reorder
    const start = dragStartPoint.current;
    if (!start) return null;
    const x = start.x + e.delta.x;
    const y = start.y + e.delta.y;
    const card = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(
      "[data-el-name]",
    );
    const name = card?.dataset.elName;
    if (!card || !name || name === activeId) return null;
    const overEl = findElement(schema, name);
    if (!overEl || isContainerType(overEl.type)) return null;
    return name;
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    setOverDragId(null);
    store.setDropTarget(null, null);
    const { active, over } = e;
    const activeId = String(active.id);

    // Drag-to-group: a rightward nudge onto another question groups them (or, when the
    // target lives in a section, drops the dragged card into that section). Checked before
    // the `over` guard so a drop onto a nested child (which can yield over=null) still works.
    const groupTarget = groupDropTarget(e);
    if (groupTarget) {
      store.groupOrJoin(activeId, groupTarget);
      return;
    }

    if (!over) return;
    const overId = String(over.id);

    // Zones store their location directly; element cards store it under `location`.
    const data = over.data.current as (DropLocation & { location?: DropLocation }) | undefined;
    let loc: DropLocation | undefined =
      data?.location ?? (data?.pageIndex !== undefined ? data : undefined);
    if (!loc) return;

    // Dropping onto a section card means "into the section" (appended at the end),
    // unless the dragged item is already a direct child of that section.
    const overEl = findElement(schema, overId);
    if (overEl && isContainerType(overEl.type)) {
      const isOwnChild = overEl.elements?.some((c) => c.name === activeId) ?? false;
      if (!isOwnChild && overId !== activeId) {
        loc = {
          pageIndex: loc.pageIndex,
          parentName: overEl.name,
          index: overEl.elements?.length ?? 0,
        };
      }
    }

    if (activeId.startsWith("palette:")) {
      // Palette drag → insert new element at the drop target's position.
      const type = activeId.slice("palette:".length) as ElementType;
      store.addAt(type, { pageIndex: loc.pageIndex, parentName: loc.parentName }, loc.index);
      return;
    }

    if (activeId === overId) return;

    // Edge-of-card drops reorder; centre-of-card drops are handled by the grouping branch
    // above. The overflow-menu "Group with another" action remains as a keyboard-free path.
    store.moveInto(activeId, { pageIndex: loc.pageIndex, parentName: loc.parentName }, loc.index);
  }

  // ---- exports/imports ----
  function download(content: string, mime: string, ext: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${schema.name || "form"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    download(JSON.stringify(schema, null, 2), "application/json", "json");
  }

  function exportText() {
    download(formToText(schema), "text/plain", "txt");
  }

  async function importJson(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as FormSchema;
      if (!parsed || !Array.isArray(parsed.pages)) throw new Error("Not a Supform form schema.");
      store.loadTemplate(parsed);
      navigate("/builder/new");
    } catch (err) {
      window.alert(`Could not import: ${(err as Error).message}`);
    }
  }

  function saveAsTemplate() {
    const name = window.prompt("Save this form as a template named:", localize(schema.title));
    if (name === null) return;
    saveMyTemplate(name, schema);
    window.alert("Saved to My templates.");
  }

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      // "?" opens the keyboard-shortcuts legend (when not typing into a field).
      if (e.key === "?" && !inText) {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
        return;
      }

      // Esc: close the shortcuts help, cancel group-link mode, or clear selection.
      if (e.key === "Escape") {
        if (shortcutsOpen) {
          setShortcutsOpen(false);
        } else if (groupingSource) {
          setGroupingSource(null);
        } else {
          store.clearSelection();
        }
        return;
      }

      // Delete / Backspace: remove selected elements (when not typing).
      if ((e.key === "Delete" || e.key === "Backspace") && !inText) {
        if (selectedNames.size > 1) {
          e.preventDefault();
          store.removeSelected();
        } else if (selectedName) {
          e.preventDefault();
          // Deleting a section takes its questions with it — confirm first.
          const el = findElement(schema, selectedName);
          if (el && !confirmDeleteContainer(el.type, el.elements?.length ?? 0)) return;
          store.remove(selectedName);
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey) || inText) return;

      // Ctrl+Z / Ctrl+Shift+Z undo/redo.
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useBuilderStore.getState().redo();
        else useBuilderStore.getState().undo();
        return;
      }

      // Ctrl+G: group selection.
      if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (selectedNames.size >= 2) store.groupSelected();
        return;
      }

      // Ctrl+D: duplicate selection or focused element.
      if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selectedNames.size >= 2) store.duplicateSelected();
        else if (selectedName) store.duplicate(selectedName);
        return;
      }

      // Ctrl+A: select all top-level elements on the active page.
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        const names = pageElements(schema, activePage).map((el) => el.name);
        if (names.length > 0) {
          useBuilderStore.setState({
            selectedNames: new Set(names),
            selectedName: names[0],
          });
        }
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [groupingSource, shortcutsOpen, selectedName, selectedNames, schema, activePage, store]);

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
      <header className="builder-toolbar">
        <input
          className="title-input"
          value={localize(schema.title)}
          onChange={(e) => store.setTitle(e.target.value)}
          aria-label="Form title"
        />
        <div className="toolbar-actions">
          <Button
            variant="ghost"
            size="sm"
            title="Undo (Ctrl+Z)"
            onClick={() => store.undo()}
            disabled={store.past.length === 0}
          >
            ↶
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Redo (Ctrl+Shift+Z)"
            onClick={() => store.redo()}
            disabled={store.future.length === 0}
          >
            ↷
          </Button>
          {error ? <span className="error">{error}</span> : null}
          <span
            className="save-status"
            data-state={status === "saving" ? "saving" : dirty ? "dirty" : "saved"}
            aria-live="polite"
          >
            {status === "saving" ? "Saving…" : dirty ? "Unsaved changes" : "Saved ✓"}
          </span>
          {store.formId ? (
            <Link className="toolbar-link" to={`/forms/${store.formId}/responses`}>
              Responses
            </Link>
          ) : null}
          {/* Utility actions collapse into a disclosure so the primary actions
              (Save draft / Publish) are always visible, never scrolled off. */}
          <details className="toolbar-more">
            <summary aria-label="More actions">More ▾</summary>
            <div className="toolbar-more-menu">
              {store.formId ? (
                <button type="button" onClick={() => setShareLink(true)}>
                  Share link
                </button>
              ) : null}
              {store.projectId ? (
                <button type="button" onClick={() => setSharing(true)}>
                  Share access
                </button>
              ) : null}
              {store.formId ? (
                <button type="button" onClick={() => setIntegrations(true)}>
                  Integrations
                </button>
              ) : null}
              <button type="button" onClick={saveAsTemplate}>
                Save as template
              </button>
              <button type="button" onClick={exportJson}>
                Export JSON
              </button>
              <button type="button" onClick={exportText}>
                Export text
              </button>
              <button type="button" onClick={() => importRef.current?.click()}>
                Import JSON
              </button>
            </div>
          </details>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importJson(file);
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => store.save()}
            disabled={status === "saving"}
          >
            {status === "saving" ? "Saving…" : "Save draft"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              await store.publish();
              const s = useBuilderStore.getState();
              if (s.error) {
                showToast(s.error, "danger");
              } else {
                showToast("Form published! Share the link with respondents.");
                setShareLink(true);
              }
            }}
            disabled={status === "publishing"}
          >
            {status === "publishing" ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </header>

      {!hintDismissed && (
        <div className="builder-hint">
          <span>
            <strong>1.</strong> Add a question · <strong>2.</strong> Preview · <strong>3.</strong>{" "}
            Publish &amp; share. Press <kbd>?</kbd> for shortcuts.
          </span>
          <button
            type="button"
            className="builder-hint-close"
            aria-label="Dismiss"
            onClick={() => {
              localStorage.setItem("supform.builderHintDismissed", "1");
              setHintDismissed(true);
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* One DndContext covers both the palette (useDraggable) and the canvas (useSortable). */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveDragId(null);
          setOverDragId(null);
          dragStartPoint.current = null;
          store.setDropTarget(null, null);
        }}
      >
        <div
          className={`builder-body${paletteOpen ? "" : " palette-collapsed"}${inspectorOpen ? "" : " inspector-collapsed"}`}
        >
          {/* Palette */}
          <aside className="palette">
            {paletteOpen && (
              <div className="palette-content">
                <div className="palette-tabs">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={!showLibrary ? "palette-tab active" : "palette-tab"}
                    onClick={() => setShowLibrary(false)}
                  >
                    Fields
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={showLibrary ? "palette-tab active" : "palette-tab"}
                    onClick={() => setShowLibrary(true)}
                  >
                    Library
                  </Button>
                </div>
                {showLibrary ? (
                  <QuestionLibraryPanel onClose={() => setShowLibrary(false)} />
                ) : (
                  <>
                    <p className="palette-heading">Add a question</p>
                    {COMMON_PALETTE.map((item) => (
                      <PaletteItem
                        key={item.type}
                        type={item.type}
                        label={item.label}
                        icon={item.icon}
                      />
                    ))}
                    <details className="palette-more">
                      <summary>More types</summary>
                      {ADVANCED_PALETTE.map((item) => (
                        <PaletteItem
                          key={item.type}
                          type={item.type}
                          label={item.label}
                          icon={item.icon}
                        />
                      ))}
                    </details>
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              className="panel-toggle"
              title={paletteOpen ? "Collapse fields panel" : "Expand fields panel"}
              aria-label={paletteOpen ? "Collapse fields panel" : "Expand fields panel"}
              onClick={() => setPaletteOpen((o) => !o)}
            >
              <span className="panel-toggle-chip" aria-hidden="true">
                <Chevron dir={paletteOpen ? "left" : "right"} />
              </span>
            </button>
          </aside>

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
          <aside className={`inspector${inspectorOpen ? "" : " inspector-collapsed"}`}>
            <button
              type="button"
              className="panel-toggle"
              title={inspectorOpen ? "Collapse inspector" : "Expand inspector"}
              aria-label={inspectorOpen ? "Collapse inspector" : "Expand inspector"}
              onClick={() => setInspectorOpen((o) => !o)}
            >
              <span className="panel-toggle-chip" aria-hidden="true">
                <Chevron dir={inspectorOpen ? "right" : "left"} />
              </span>
            </button>
            <div className="inspector-inner">
              <div className="tabs">
                {(
                  [
                    "overview",
                    "properties",
                    "theme",
                    "settings",
                    ...(isMultilingual ? (["translate"] as Tab[]) : []),
                    "preview",
                    "history",
                    ...(formId !== "new" ? (["activity"] as Tab[]) : []),
                  ] as Tab[]
                ).map((t) => (
                  <Button
                    key={t}
                    variant="ghost"
                    size="sm"
                    className={tab === t ? "tab active" : "tab"}
                    onClick={() => setTab(t)}
                    title={
                      t === "overview"
                        ? "Overview — all fields at a glance"
                        : t === "properties"
                          ? "Properties — edit this field"
                          : t === "theme"
                            ? "Theme — colours & fonts"
                            : t === "settings"
                              ? "Settings — form behaviour"
                              : t === "translate"
                                ? "Translations"
                                : t === "preview"
                                  ? "Live preview"
                                  : t === "history"
                                    ? "History — session edits & published versions"
                                    : "Activity log"
                    }
                  >
                    {t === "overview"
                      ? "Map"
                      : t === "translate"
                        ? "🌐"
                        : t === "history"
                          ? "History"
                          : t === "activity"
                            ? "Activity"
                            : t === "preview"
                              ? "Live"
                              : t.charAt(0).toUpperCase() + t.slice(1)}
                  </Button>
                ))}
              </div>

              {tab === "overview" && <OverviewPanel />}
              {tab === "properties" &&
                (selected ? (
                  <PropertiesPanel element={selected} />
                ) : (
                  <p className="muted">Select a question to edit its settings.</p>
                ))}
              {tab === "theme" && <ThemePanel />}
              {tab === "settings" && <SettingsPanel />}
              {tab === "translate" && <TranslatePanel />}
              {tab === "preview" && (
                <BirdsEyePreview schema={schema} onOpenFull={() => setPreviewOpen(true)} />
              )}
              {tab === "activity" && formId !== "new" && <ActivityPanel formId={formId} />}
              {tab === "history" && (
                <HistoryPanel
                  formId={formId}
                  onRestoreVersion={async (version) => {
                    const versionSchema = await api.getVersion(formId, version);
                    store.loadTemplate(versionSchema);
                    await store.save();
                  }}
                />
              )}
            </div>
          </aside>
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.3,1)" }}>
          {activePaletteItem ? (
            <div className="palette-item drag-ghost">
              <span aria-hidden="true">{activePaletteItem.icon}</span> {activePaletteItem.label}
            </div>
          ) : activeCanvasElement ? (
            <div className="el-card drag-ghost">
              <div className="el-row">
                <span className="drag-handle" aria-hidden="true">
                  ⋮⋮
                </span>
                <span className="el-card-body">
                  <span className="el-label">
                    {localize(activeCanvasElement.label) || activeCanvasElement.name}
                  </span>
                  <span className="el-type">{activeCanvasElement.type.replace(/_/g, " ")}</span>
                </span>
                {activeCanvasElement.elements?.length ? (
                  <span className="drag-count">{activeCanvasElement.elements.length} inside</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {previewOpen && <PreviewModal schema={schema} onClose={() => setPreviewOpen(false)} />}
      {sharing && store.projectId && (
        <ShareDialog projectId={store.projectId} onClose={() => setSharing(false)} />
      )}
      {integrations && store.formId && (
        <WebhooksDialog formId={store.formId} onClose={() => setIntegrations(false)} />
      )}
      {shareLink && store.formId && (
        <ShareLinkDialog formId={store.formId} onClose={() => setShareLink(false)} />
      )}
      <Modal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        title="Keyboard shortcuts"
        width="sm"
      >
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

      {toast && (
        <output className={`builder-toast builder-toast--${toast.tone}`} aria-live="polite">
          <span>{toast.msg}</span>
          <button
            type="button"
            className="builder-toast-close"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </output>
      )}
    </div>
  );
}

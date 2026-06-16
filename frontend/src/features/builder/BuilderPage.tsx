import { Button } from "@/components";
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
import { BuilderCanvas, type DropLocation } from "./BuilderCanvas";
import { LanguagePreview } from "./LanguagePreview";
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
import { ELEMENT_PALETTE } from "./palette";

type Tab = "overview" | "properties" | "theme" | "settings" | "translate" | "preview";

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
  const importRef = useRef<HTMLInputElement>(null);
  const isMultilingual = (schema.languages?.length ?? 0) >= 2;

  // ---- drag state (shared across palette + canvas) ----
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overDragId, setOverDragId] = useState<string | null>(null);

  // ---- group-link mode ----
  // null = not active; string = the name of the card that initiated grouping
  const [groupingSource, setGroupingSource] = useState<string | null>(null);

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
    // Select the element being dragged (not for palette items).
    if (!id.startsWith("palette:")) store.select(id);
  }

  function handleDragOver(e: DragOverEvent) {
    setOverDragId(e.over ? String(e.over.id) : null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    setOverDragId(null);
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
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

    // Drag a non-container card directly onto another non-container card → group them.
    const isZone = (id: string) => id.startsWith("dz:") || id.startsWith("page:");
    const activeElForGroup = findElement(schema, activeId);
    const overElForGroup = findElement(schema, overId);
    if (
      !isZone(overId) &&
      activeElForGroup &&
      overElForGroup &&
      !isContainerType(activeElForGroup.type) &&
      !isContainerType(overElForGroup.type)
    ) {
      store.confirmGrouping(activeId, overId);
      return;
    }

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      // Esc: cancel group-link mode or clear selection.
      if (e.key === "Escape") {
        if (groupingSource) {
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
  }, [groupingSource, selectedName, selectedNames, schema, activePage, store]);

  const elements = pageElements(schema, activePage);
  const selected = selectedName ? findElement(schema, selectedName) : null;

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
          <span className="muted">
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
            onClick={() => store.publish()}
            disabled={status === "publishing"}
          >
            {status === "publishing" ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </header>

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
        }}
      >
        <div className="builder-body">
          {/* Palette */}
          <aside className="palette">
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
                {ELEMENT_PALETTE.map((item) => (
                  <PaletteItem
                    key={item.type}
                    type={item.type}
                    label={item.label}
                    icon={item.icon}
                  />
                ))}
              </>
            )}
          </aside>

          {/* Canvas */}
          <section className={`canvas${groupingSource ? " linking" : ""}`}>
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
              </div>
            )}

            {elements.length === 0 ? (
              <p className="muted empty">Pick a question type on the left to start building.</p>
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
          <aside className="inspector">
            <div className="tabs">
              {(
                [
                  "overview",
                  "properties",
                  "theme",
                  "settings",
                  ...(isMultilingual ? (["translate"] as Tab[]) : []),
                  "preview",
                ] as Tab[]
              ).map((t) => (
                <Button
                  key={t}
                  variant="ghost"
                  size="sm"
                  className={tab === t ? "tab active" : "tab"}
                  onClick={() => setTab(t)}
                >
                  {t === "overview"
                    ? "Map"
                    : t === "translate"
                      ? "🌐"
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
            {tab === "preview" && <LanguagePreview schema={schema} />}
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
    </div>
  );
}

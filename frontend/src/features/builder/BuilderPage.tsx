import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { ElementType, FormSchema } from "@/types/form-schema";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FormRenderer } from "../renderer/FormRenderer";
import { saveMyTemplate } from "../templates/myTemplates";
import { BuilderCanvas, type DropLocation } from "./BuilderCanvas";
import { PropertiesPanel } from "./PropertiesPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ShareDialog } from "./ShareDialog";
import { ShareLinkDialog } from "./ShareLinkDialog";
import { ThemePanel } from "./ThemePanel";
import { WebhooksDialog } from "./WebhooksDialog";
import { findElement, pageElements } from "./model";
import { PaletteItem } from "./PaletteItem";
import { ELEMENT_PALETTE } from "./palette";

type Tab = "properties" | "theme" | "settings" | "preview";

export function BuilderPage() {
  const { formId = "new" } = useParams();
  const navigate = useNavigate();
  const store = useBuilderStore();
  const init = useBuilderStore((s) => s.init);
  const { schema, selectedName, selectedNames, activePage, status, error, dirty } = store;
  const [tab, setTab] = useState<Tab>("properties");
  const [sharing, setSharing] = useState(false);
  const [shareLink, setShareLink] = useState(false);
  const [integrations, setIntegrations] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

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
    const data = over.data.current as
      | (DropLocation & { location?: DropLocation })
      | undefined;
    const loc: DropLocation | undefined = data?.location ?? (data?.pageIndex !== undefined ? data : undefined);
    if (!loc) return;

    if (activeId.startsWith("palette:")) {
      // Palette drag → insert new element at the drop target's position.
      const type = activeId.slice("palette:".length) as ElementType;
      store.addAt(type, { pageIndex: loc.pageIndex, parentName: loc.parentName }, loc.index);
      return;
    }

    if (activeId === overId) return;
    store.moveInto(activeId, { pageIndex: loc.pageIndex, parentName: loc.parentName }, loc.index);
  }

  // ---- exports/imports ----
  function exportJson() {
    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${schema.name || "form"}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
    activeDragId && !activeDragId.startsWith("palette:")
      ? findElement(schema, activeDragId)
      : null;

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
          <button
            type="button"
            title="Undo (Ctrl+Z)"
            onClick={() => store.undo()}
            disabled={store.past.length === 0}
          >
            ↶
          </button>
          <button
            type="button"
            title="Redo (Ctrl+Shift+Z)"
            onClick={() => store.redo()}
            disabled={store.future.length === 0}
          >
            ↷
          </button>
          {error ? <span className="error">{error}</span> : null}
          <span className="muted">
            {status === "saving" ? "Saving…" : dirty ? "Unsaved changes" : "Saved ✓"}
          </span>
          {store.formId ? (
            <button type="button" title="Public link, embed code, and QR" onClick={() => setShareLink(true)}>
              Share link
            </button>
          ) : null}
          {store.projectId ? (
            <button type="button" title="Manage who can collaborate on this project" onClick={() => setSharing(true)}>
              Share access
            </button>
          ) : null}
          {store.formId ? (
            <button type="button" title="Send submissions to external URLs" onClick={() => setIntegrations(true)}>
              Integrations
            </button>
          ) : null}
          {store.formId ? <Link to={`/forms/${store.formId}/responses`}>Responses</Link> : null}
          <button type="button" title="Save as a personal template" onClick={saveAsTemplate}>
            Save as template
          </button>
          <button type="button" title="Download this form's JSON schema" onClick={exportJson}>
            Export JSON
          </button>
          <button type="button" title="Load a form from a JSON file" onClick={() => importRef.current?.click()}>
            Import JSON
          </button>
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
          <button type="button" onClick={() => store.save()} disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => store.publish()}
            disabled={status === "publishing"}
          >
            {status === "publishing" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </header>

      {/* One DndContext covers both the palette (useDraggable) and the canvas (useSortable). */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
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
            <h3>Add a question</h3>
            {ELEMENT_PALETTE.map((item) => (
              <PaletteItem key={item.type} type={item.type} label={item.label} icon={item.icon} />
            ))}
          </aside>

          {/* Canvas */}
          <section className={`canvas${groupingSource ? " linking" : ""}`}>
            <div className="page-bar">
              {schema.pages.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  className={i === activePage ? "page-tab active" : "page-tab"}
                  onClick={() => store.setActivePage(i)}
                >
                  {localize(p.title) || `Page ${i + 1}`}
                </button>
              ))}
              <button type="button" className="page-add" onClick={() => store.addPage()}>
                + Page
              </button>
            </div>

            {schema.pages.length > 1 && (
              <div className="page-settings">
                <input
                  type="text"
                  aria-label="Page title"
                  value={localize(schema.pages[activePage]?.title) || ""}
                  placeholder={`Page ${activePage + 1}`}
                  onChange={(e) => store.renamePage(activePage, e.target.value)}
                />
                <button type="button" onClick={() => store.removePage(activePage)}>
                  Delete page
                </button>
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
                    import("./model").then(({ groupElements }) => {
                      const s = useBuilderStore.getState();
                      const { schema: next, groupName } = groupElements(s.schema, [
                        groupingSource,
                        name,
                      ]);
                      if (groupName) {
                        useBuilderStore.setState({
                          schema: next,
                          selectedName: groupName,
                          selectedNames: new Set([groupName]),
                          dirty: true,
                        });
                      }
                    });
                    setGroupingSource(null);
                  }
                }}
              />
            )}
          </section>

          {/* Inspector */}
          <aside className="inspector">
            <div className="tabs">
              {(["properties", "theme", "settings", "preview"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={tab === t ? "tab active" : "tab"}
                  onClick={() => setTab(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {tab === "properties" &&
              (selected ? (
                <PropertiesPanel element={selected} />
              ) : (
                <p className="muted">Select a question to edit its settings.</p>
              ))}
            {tab === "theme" && <ThemePanel />}
            {tab === "settings" && <SettingsPanel />}
            {tab === "preview" && (
              <div className="preview-pane">
                <FormRenderer schema={schema} formId="preview" />
              </div>
            )}
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
                <span className="drag-handle" aria-hidden="true">⋮⋮</span>
                <span className="el-card-body">
                  <span className="el-label">
                    {localize(activeCanvasElement.label) || activeCanvasElement.name}
                  </span>
                  <span className="el-type">
                    {activeCanvasElement.type.replace(/_/g, " ")}
                  </span>
                </span>
                {activeCanvasElement.elements?.length ? (
                  <span className="drag-count">{activeCanvasElement.elements.length} inside</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

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

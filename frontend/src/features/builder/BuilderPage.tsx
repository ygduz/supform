import { api } from "@/api/client";
import { Button, Modal } from "@/components";
import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { ElementType, FormSchema } from "@/types/form-schema";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formToText } from "../import/textForm";
import { saveMyTemplate } from "../templates/myTemplates";
import { ActivityPanel } from "./ActivityPanel";
import { BirdsEyePreview } from "./BirdsEyePreview";
import { BuilderCanvas } from "./BuilderCanvas";
import { ChecksPanel } from "./ChecksPanel";
import { CommandPalette } from "./CommandPalette";
import { DesignPanel } from "./DesignPanel";
import { HistoryPanel } from "./HistoryPanel";
import { InspectorResizer } from "./InspectorResizer";
import { LogicBuilder } from "./LogicBuilder";
import { OverviewPanel } from "./OverviewPanel";
import { PaletteItem } from "./PaletteItem";
import { PreviewModal } from "./PreviewModal";
import { PropertiesPanel } from "./PropertiesPanel";
import { QuestionLibraryPanel } from "./QuestionLibraryPanel";
import { ResultsPanel } from "./ResultsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ShareDialog } from "./ShareDialog";
import { SharePanel } from "./SharePanel";
import { ThemePanel } from "./ThemePanel";
import { TranslatePanel } from "./TranslatePanel";
import { WebhooksDialog } from "./WebhooksDialog";
import { lintForm } from "./lint";
import { findElement, pageElements } from "./model";
import { ADVANCED_PALETTE, COMMON_PALETTE, ELEMENT_PALETTE } from "./palette";
import { useBuilderDrag } from "./useBuilderDrag";
import { useBuilderShortcuts } from "./useBuilderShortcuts";

type Tab =
  | "overview"
  | "checks"
  | "properties"
  | "theme"
  | "settings"
  | "translate"
  | "preview"
  | "history"
  | "activity";

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
  const [shareTab, setShareTab] = useState<"link" | "people" | null>(null);
  const [integrations, setIntegrations] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  // v2 shell: icon-rail mode (each renders its own panel below), device preview width, and
  // a light/dark toggle for the builder chrome itself (unrelated to the form's own theme).
  const [mode, setMode] = useState<"build" | "design" | "share" | "results">("build");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [builderTheme, setBuilderTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("supform.builderTheme") as "light" | "dark" | null) ?? "light",
  );
  const toggleBuilderTheme = () =>
    setBuilderTheme((t) => {
      const next = t === "light" ? "dark" : "light";
      localStorage.setItem("supform.builderTheme", next);
      return next;
    });

  // Rail actions: each mode now renders its own bespoke panel in .builder-main (see below)
  // instead of bridging to the old tab/dialog/navigation. The dialogs themselves are untouched
  // and still opened from the toolbar's "More" menu and the post-publish toast — this is an
  // additional entry point, not a replacement.
  function onRailDesign() {
    setMode("design");
  }
  function onRailShare() {
    setMode("share");
  }
  function onRailResults() {
    setMode("results");
  }
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
    if (selectedName) {
      setTab("properties");
      setMode("build");
    }
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

  useBuilderShortcuts({
    shortcutsOpen,
    setShortcutsOpen,
    closeShortcuts: () => setShortcutsOpen(false),
    groupingSource,
    clearGroupingSource: () => setGroupingSource(null),
    toggleCommandPalette: () => setCommandPaletteOpen((o) => !o),
  });

  const elements = pageElements(schema, activePage);
  const selected = selectedName ? findElement(schema, selectedName) : null;
  // Live form-checker notes — drives the Checks tab badge and the panel.
  const notes = lintForm(schema);
  const errorCount = notes.filter((n) => n.level === "error").length;

  // Inspector tabs: v2 keeps exactly three primary destinations (Settings/Preview/Mind map)
  // and folds everything else — Checks, Theme, Form settings, Translate, History, Activity —
  // into a "⋯" overflow, same pattern as the earlier nav-consistency pass. Nothing is removed,
  // just relocated: every one of those panels is still one click away.
  const primaryTabs: Tab[] = ["properties", "preview", "overview"];
  const overflowTabs: Tab[] = [
    "checks",
    "theme",
    "settings",
    ...(isMultilingual ? (["translate"] as Tab[]) : []),
    "history",
    ...(formId !== "new" ? (["activity"] as Tab[]) : []),
  ];
  const TAB_TITLE: Record<Tab, string> = {
    overview: "Mind map — structure, flow, and logic at a glance",
    checks: "Checks — live notes about logic & references",
    properties: "Settings — edit the selected field, or form behaviour when nothing is selected",
    theme: "Theme — colours & fonts",
    settings: "Form settings — behaviour, access, scheduling",
    translate: "Translations",
    preview: "Live preview",
    history: "History — session edits & published versions",
    activity: "Activity log",
  };
  const tabLabel = (t: Tab): string => {
    if (t === "overview") return "Mind map";
    if (t === "preview") return "Live";
    if (t === "properties") return "Settings";
    if (t === "settings") return "Form settings";
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const renderTab = (t: Tab) => (
    <Button
      key={t}
      variant="ghost"
      size="sm"
      className={tab === t ? "tab active" : "tab"}
      onClick={() => setTab(t)}
      title={TAB_TITLE[t]}
    >
      {tabLabel(t)}
      {t === "checks" && notes.length > 0 && (
        <span className={`tab-badge${errorCount > 0 ? " error" : " warning"}`}>{notes.length}</span>
      )}
    </Button>
  );

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
    <div className="builder" data-theme={builderTheme}>
      <header className="builder-toolbar">
        <Link className="builder-back" to="/forms" title="Back to my forms">
          ←
        </Link>
        <input
          className="title-input"
          value={localize(schema.title)}
          onChange={(e) => store.setTitle(e.target.value)}
          aria-label="Form title"
        />
        {store.formStatus && (
          <span className={`form-status-pill form-status-pill--${store.formStatus}`}>
            {store.formStatus}
          </span>
        )}
        {store.formId ? (
          <div className="form-context-tabs builder-context-tabs">
            <span className="active">Questions</span>
            <Link to={`/forms/${store.formId}/responses`}>Responses</Link>
          </div>
        ) : null}
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
          {/* biome-ignore lint/a11y/useSemanticElements: a button group, not a form fieldset */}
          <div className="device-toggle" role="group" aria-label="Preview device width">
            <button
              type="button"
              className={device === "desktop" ? "active" : undefined}
              title="Desktop width"
              aria-label="Desktop width"
              onClick={() => setDevice("desktop")}
            >
              🖥
            </button>
            <button
              type="button"
              className={device === "mobile" ? "active" : undefined}
              title="Mobile width"
              aria-label="Mobile width"
              onClick={() => setDevice("mobile")}
            >
              📱
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            title={builderTheme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            onClick={toggleBuilderTheme}
          >
            {builderTheme === "light" ? "🌙" : "☀️"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Command palette (Ctrl/Cmd+K)"
            onClick={() => setCommandPaletteOpen(true)}
          >
            ⌘K
          </Button>
          {/* Utility actions collapse into a disclosure so the primary actions
              (Save draft / Publish) are always visible, never scrolled off. */}
          <details className="toolbar-more">
            <summary aria-label="More actions">More ▾</summary>
            <div className="toolbar-more-menu">
              {(store.formId || store.projectId) && <p className="menu-section">Share</p>}
              {store.formId ? (
                <button type="button" onClick={() => setShareTab("link")}>
                  Share link
                </button>
              ) : null}
              {store.projectId ? (
                <button type="button" onClick={() => setShareTab("people")}>
                  Share access
                </button>
              ) : null}
              {store.formId ? (
                <button type="button" onClick={() => setIntegrations(true)}>
                  Integrations
                </button>
              ) : null}
              <p className="menu-section">Template</p>
              <button type="button" onClick={saveAsTemplate}>
                Save as template
              </button>
              <p className="menu-section">Data</p>
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
                setShareTab("link");
              }
            }}
            disabled={status === "publishing"}
          >
            {status === "publishing" ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </header>

      <div className="builder-shell">
        {/* Icon rail: top-level modes, each swapping .builder-main's content below. */}
        <aside className="builder-rail">
          <button
            type="button"
            className={mode === "build" ? "rail-btn active" : "rail-btn"}
            title="Build — questions & pages"
            onClick={() => setMode("build")}
          >
            <span aria-hidden="true">📋</span>
            <small>Build</small>
          </button>
          <button
            type="button"
            className={mode === "design" ? "rail-btn active" : "rail-btn"}
            title="Design — theme & appearance"
            onClick={onRailDesign}
          >
            <span aria-hidden="true">🎨</span>
            <small>Design</small>
          </button>
          <button
            type="button"
            className={mode === "share" ? "rail-btn active" : "rail-btn"}
            title="Share this form"
            onClick={onRailShare}
          >
            <span aria-hidden="true">🔗</span>
            <small>Share</small>
          </button>
          <button
            type="button"
            className={mode === "results" ? "rail-btn active" : "rail-btn"}
            title={store.formId ? "View results" : "Save the form to view results"}
            disabled={!store.formId}
            onClick={onRailResults}
          >
            <span aria-hidden="true">📊</span>
            <small>Results</small>
          </button>
          <div className="rail-spacer" />
          <button
            type="button"
            className="rail-btn rail-help"
            title="Keyboard shortcuts"
            onClick={() => setShortcutsOpen(true)}
          >
            <span aria-hidden="true">?</span>
          </button>
        </aside>

        <div className="builder-main">
          {mode === "build" && (
            <>
              {!hintDismissed && (
                <div className="builder-hint">
                  <span>
                    <strong>1.</strong> Add a question · <strong>2.</strong> Preview ·{" "}
                    <strong>3.</strong> Publish &amp; share. Press <kbd>?</kbd> for shortcuts.
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
                onDragCancel={handleDragCancel}
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
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => store.removePage(activePage)}
                          >
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
                                      const rules = [
                                        ...(schema.pages[activePage]?.nextPageIf ?? []),
                                      ];
                                      rules[ri] = { ...rules[ri], condition: v ?? "" };
                                      store.setPageNextPageIf(activePage, rules);
                                    }}
                                  />
                                  <div className="page-branching-target">
                                    {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps select below */}
                                    <label className="page-branching-target-label">
                                      Go to page
                                    </label>
                                    <select
                                      value={rule.page}
                                      onChange={(e) => {
                                        const rules = [
                                          ...(schema.pages[activePage]?.nextPageIf ?? []),
                                        ];
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
                                        const rules = (
                                          schema.pages[activePage]?.nextPageIf ?? []
                                        ).filter((_, i) => i !== ri);
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
                          Click a field type in the left panel to add it, or drag one onto the
                          canvas.
                        </p>
                      </div>
                    ) : (
                      <BuilderCanvas
                        elements={elements}
                        pageIndex={activePage}
                        activeDragId={activeDragId}
                        overDragId={overDragId}
                        groupingSource={groupingSource}
                        device={device}
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
                    {inspectorOpen && <InspectorResizer />}
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
                        {primaryTabs.map(renderTab)}
                        {overflowTabs.length > 0 && (
                          <details className="tabs-more">
                            <summary
                              className={overflowTabs.includes(tab) ? "tab active" : "tab"}
                              title="More panels — Checks, Theme, Form settings, Translate, History, Activity"
                            >
                              ⋯
                              {notes.length > 0 && (
                                <span
                                  className={`tab-badge${errorCount > 0 ? " error" : " warning"}`}
                                >
                                  {notes.length}
                                </span>
                              )}
                            </summary>
                            <div className="tabs-more-menu">{overflowTabs.map(renderTab)}</div>
                          </details>
                        )}
                      </div>

                      {tab === "overview" && <OverviewPanel />}
                      {tab === "checks" && <ChecksPanel />}
                      {tab === "properties" &&
                        (selected ? <PropertiesPanel element={selected} /> : <SettingsPanel />)}
                      {tab === "theme" && <ThemePanel />}
                      {tab === "settings" && <SettingsPanel />}
                      {tab === "translate" && <TranslatePanel />}
                      {tab === "preview" && (
                        <BirdsEyePreview
                          schema={schema}
                          device={device}
                          onOpenFull={() => setPreviewOpen(true)}
                        />
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
                      <span aria-hidden="true">{activePaletteItem.icon}</span>{" "}
                      {activePaletteItem.label}
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
                          <span className="el-type">
                            {activeCanvasElement.type.replace(/_/g, " ")}
                          </span>
                        </span>
                        {activeCanvasElement.elements?.length ? (
                          <span className="drag-count">
                            {activeCanvasElement.elements.length} inside
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </>
          )}
          {mode === "design" && (
            <DesignPanel device={device} onOpenFullPreview={() => setPreviewOpen(true)} />
          )}
          {mode === "share" && (
            <SharePanel formId={store.formId} onOpenIntegrations={() => setIntegrations(true)} />
          )}
          {mode === "results" && store.formId && <ResultsPanel formId={store.formId} />}
        </div>
      </div>

      {previewOpen && <PreviewModal schema={schema} onClose={() => setPreviewOpen(false)} />}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenPreview={() => setPreviewOpen(true)}
        onToggleTheme={toggleBuilderTheme}
        onSetMode={setMode}
      />
      {shareTab && (
        <ShareDialog
          formId={store.formId ?? undefined}
          projectId={store.projectId ?? undefined}
          initialTab={shareTab}
          onClose={() => setShareTab(null)}
        />
      )}
      {integrations && store.formId && (
        <WebhooksDialog formId={store.formId} onClose={() => setIntegrations(false)} />
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

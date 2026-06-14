import { api, isAuthenticated } from "@/api/client";
import { buildConnectorExpression } from "@/features/builder/connectors";
import * as model from "@/features/builder/model";
import type {
  Choice,
  Element,
  ElementType,
  FormSchema,
  FormSettings,
  I18nString,
  Theme,
} from "@/types/form-schema";
import { create } from "zustand";

type Status = "idle" | "loading" | "saving" | "publishing" | "error";

const NOT_SIGNED_IN = "Please sign in to save your form.";
const HISTORY_LIMIT = 50;
const AUTOSAVE_DELAY_MS = 2000;

/** Find the user's first project, or create a default one to hold their forms. */
async function resolveProjectId(): Promise<string> {
  const projects = await api.listProjects();
  if (projects.length > 0) return projects[0].id;
  const created = await api.createProject("My forms");
  return created.id;
}

interface BuilderState {
  formId: string | null;
  projectId: string | null;
  schema: FormSchema;
  selectedName: string | null;
  /** The full multi-select set. Size > 1 means multi-select mode is active. */
  selectedNames: Set<string>;
  /** Names of container elements currently collapsed on the canvas (UI-only). */
  collapsedNames: Set<string>;
  /** Name of the top-most question currently in the canvas viewport (scroll-spy, UI-only). */
  viewportName: string | null;
  activePage: number;
  status: Status;
  error: string | null;
  dirty: boolean;
  // Set when a template was seeded for a new form, so `init("new")` won't wipe it.
  templateLoaded: boolean;
  // Undo/redo history of schema snapshots (bounded; cleared on init/loadTemplate).
  past: FormSchema[];
  future: FormSchema[];

  init: (formId: string) => Promise<void>;
  loadTemplate: (schema: FormSchema) => void;
  undo: () => void;
  redo: () => void;
  /** Plain select — sets focus to one element and clears multi-select. */
  select: (name: string | null) => void;
  /** Toggle one element in/out of the multi-select set (Ctrl/Cmd+click). */
  selectToggle: (name: string) => void;
  /** Extend selection from the last focused element to `name` (Shift+click). */
  selectRange: (name: string) => void;
  clearSelection: () => void;
  setTitle: (title: I18nString) => void;
  setPageTitle: (index: number, title: I18nString) => void;
  setTheme: (patch: Partial<Theme>) => void;
  setSettings: (patch: Partial<FormSettings>) => void;
  setLanguages: (languages: string[], defaultLanguage?: string) => void;

  add: (type: ElementType) => void;
  /** Insert a fully-formed element (e.g. from the question library) onto the active page. */
  insertElement: (el: Element) => void;
  /** Insert a new element of `type` at an explicit position (palette drag-to-canvas). */
  addAt: (
    type: ElementType,
    target: { pageIndex: number; parentName?: string },
    index: number,
  ) => void;
  update: (name: string, patch: Partial<Element>) => void;
  remove: (name: string) => void;
  duplicate: (name: string) => void;
  moveBy: (name: string, delta: number) => void;
  moveTo: (name: string, index: number) => void;
  moveInto: (
    name: string,
    target: { pageIndex: number; parentName?: string },
    index: number,
  ) => void;
  /** Wrap all selectedNames into a new group in-place. No-op if they span different parents. */
  groupSelected: () => void;
  /** Dissolve a group/repeat, lifting its children into the parent's list. */
  ungroup: (name: string) => void;
  /** Toggle a container card's collapsed state (UI-only; not part of the schema). */
  toggleCollapsed: (name: string) => void;
  /** Report the question currently scrolled into the canvas viewport (scroll-spy). */
  setViewportName: (name: string | null) => void;
  /** Duplicate all selected elements (each after itself). */
  duplicateSelected: () => void;
  /** Delete all selected elements. */
  removeSelected: () => void;
  /** Set required=true/false on all selected elements. */
  setRequiredSelected: (required: boolean) => void;

  addOption: (name: string) => void;
  updateOption: (name: string, index: number, patch: Partial<Choice>) => void;
  removeOption: (name: string, index: number) => void;

  addRow: (name: string) => void;
  updateRow: (name: string, index: number, patch: Partial<Choice>) => void;
  removeRow: (name: string, index: number) => void;
  addColumn: (name: string) => void;
  updateColumn: (name: string, index: number, patch: Partial<Choice>) => void;
  removeColumn: (name: string, index: number) => void;

  /** UI state for drawing connectors between question cards. */
  connectingFrom: string | null;
  pendingConnection: { from: string; to: string } | null;
  startConnect: (name: string) => void;
  cancelConnect: () => void;
  requestConnect: (toName: string) => void;
  confirmConnect: (value: string | number | boolean, op: "==" | "!=") => void;

  setActivePage: (index: number) => void;
  addPage: () => void;
  removePage: (index: number) => void;
  renamePage: (index: number, title: string) => void;
  setPageVisibleIf: (index: number, visibleIf: string | undefined) => void;

  save: () => Promise<void>;
  publish: () => Promise<void>;
}

type Updater = Partial<BuilderState> | ((s: BuilderState) => Partial<BuilderState>);

export const useBuilderStore = create<BuilderState>((rawSet, get) => {
  // ---- history + autosave plumbing ----
  // Every schema-mutating action below funnels through `set`, which snapshots the prior
  // schema for undo and (re)arms the autosave timer — so adding a new action gets both
  // behaviors for free. `quiet` suspends recording for resets (init/loadTemplate/undo).
  let recording = true;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelAutosave = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  };

  const scheduleAutosave = () => {
    cancelAutosave();
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const s = get();
      if (s.dirty && s.status !== "saving" && s.status !== "publishing" && isAuthenticated()) {
        void s.save();
      }
    }, AUTOSAVE_DELAY_MS);
  };

  const set = (partial: Updater) => {
    const prev = get();
    rawSet(partial);
    if (!recording || !prev) return;
    const next = get();
    if (next.schema !== prev.schema && next.dirty) {
      rawSet({ past: [...prev.past, prev.schema].slice(-HISTORY_LIMIT), future: [] });
      scheduleAutosave();
    }
  };

  const quiet = (fn: () => void) => {
    recording = false;
    try {
      fn();
    } finally {
      recording = true;
    }
  };

  return {
    formId: null,
    projectId: null,
    schema: model.createEmptyForm(),
    selectedName: null,
    selectedNames: new Set<string>(),
    collapsedNames: new Set<string>(),
    viewportName: null,
    connectingFrom: null,
    pendingConnection: null,
    activePage: 0,
    status: "idle",
    error: null,
    dirty: false,
    templateLoaded: false,
    past: [],
    future: [],

    init: async (formId) => {
      cancelAutosave();
      if (formId === "new") {
        // A template was just chosen — keep it instead of resetting to a blank form.
        if (get().templateLoaded) {
          rawSet({ templateLoaded: false });
          return;
        }
        quiet(() =>
          rawSet({
            formId: null,
            projectId: null,
            schema: model.createEmptyForm(),
            selectedName: null,
            selectedNames: new Set<string>(),
            activePage: 0,
            dirty: false,
            past: [],
            future: [],
          }),
        );
        return;
      }
      // Loading an existing form supersedes any pending template seed.
      rawSet({ templateLoaded: false, status: "loading", error: null });
      try {
        const form = await api.getForm(formId);
        quiet(() =>
          rawSet({
            formId,
            projectId: form.project_id,
            schema: form.draft_content as FormSchema,
            selectedName: null,
            selectedNames: new Set<string>(),
            activePage: 0,
            status: "idle",
            dirty: false,
            past: [],
            future: [],
          }),
        );
      } catch (err) {
        // Fall back to an empty draft so the builder is still usable offline.
        quiet(() =>
          rawSet({
            status: "error",
            error: (err as Error).message,
            schema: model.createEmptyForm(),
          }),
        );
      }
    },

    loadTemplate: (schema) => {
      cancelAutosave();
      quiet(() =>
        rawSet({
          formId: null,
          projectId: null,
          // Deep-clone so editing the draft never mutates the shared template definition.
          schema: structuredClone(schema),
          selectedName: null,
          selectedNames: new Set<string>(),
          activePage: 0,
          status: "idle",
          error: null,
          dirty: true,
          templateLoaded: true,
          past: [],
          future: [],
        }),
      );
    },

    undo: () => {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      quiet(() =>
        rawSet({
          schema: prev,
          past: s.past.slice(0, -1),
          future: [s.schema, ...s.future].slice(0, HISTORY_LIMIT),
          activePage: Math.min(s.activePage, prev.pages.length - 1),
          selectedName: null,
          selectedNames: new Set<string>(),
          dirty: true,
        }),
      );
      scheduleAutosave();
    },

    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      quiet(() =>
        rawSet({
          schema: next,
          past: [...s.past, s.schema].slice(-HISTORY_LIMIT),
          future: s.future.slice(1),
          activePage: Math.min(s.activePage, next.pages.length - 1),
          selectedName: null,
          selectedNames: new Set<string>(),
          dirty: true,
        }),
      );
      scheduleAutosave();
    },

    select: (name) =>
      rawSet({
        selectedName: name,
        selectedNames: name ? new Set([name]) : new Set<string>(),
      }),

    selectToggle: (name) => {
      const { selectedNames } = get();
      const next = new Set(selectedNames);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      rawSet({
        selectedName: next.size > 0 ? name : null,
        selectedNames: next,
      });
    },

    selectRange: (name) => {
      const { schema, activePage, selectedName } = get();
      const pageEls = model.pageElements(schema, activePage).map((e) => e.name);
      const anchor = selectedName;
      if (!anchor || !pageEls.includes(anchor) || !pageEls.includes(name)) {
        rawSet({ selectedName: name, selectedNames: new Set([name]) });
        return;
      }
      const aIdx = pageEls.indexOf(anchor);
      const bIdx = pageEls.indexOf(name);
      const [lo, hi] = aIdx <= bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
      rawSet({
        selectedName: name,
        selectedNames: new Set(pageEls.slice(lo, hi + 1)),
      });
    },

    clearSelection: () => rawSet({ selectedName: null, selectedNames: new Set<string>() }),

    setTitle: (title) => set((s) => ({ schema: { ...s.schema, title }, dirty: true })),

    setLanguages: (languages, defaultLanguage) =>
      set((s) => {
        const prevCount = s.schema.languages?.length ?? 0;
        const defLang = defaultLanguage ?? s.schema.defaultLanguage ?? languages[0] ?? "en";
        // When gaining the first translation language, upgrade all plain strings to i18n objects.
        const needsMigration = prevCount < 2 && languages.length >= 1;
        const base = needsMigration ? model.migrateStringsToI18n(s.schema, defLang) : s.schema;
        return {
          schema: { ...base, languages, defaultLanguage: defLang },
          dirty: true,
        };
      }),

    setPageTitle: (index, title) =>
      set((s) => ({
        schema: {
          ...s.schema,
          pages: s.schema.pages.map((p, i) => (i === index ? { ...p, title } : p)),
        },
        dirty: true,
      })),

    setTheme: (patch) =>
      set((s) => {
        // Drop keys set back to empty so the theme object stays clean.
        const merged = { ...s.schema.theme, ...patch };
        for (const k of Object.keys(merged)) {
          if (merged[k] === undefined || merged[k] === "") delete merged[k];
        }
        return { schema: { ...s.schema, theme: merged }, dirty: true };
      }),

    setSettings: (patch) =>
      set((s) => {
        const merged = { ...s.schema.settings, ...patch };
        for (const k of Object.keys(merged)) {
          if (
            merged[k as keyof FormSettings] === undefined ||
            merged[k as keyof FormSettings] === ""
          )
            delete merged[k as keyof FormSettings];
        }
        return { schema: { ...s.schema, settings: merged }, dirty: true };
      }),

    add: (type) =>
      set((s) => {
        // Add inside the selected element when it's a container, else onto the active page.
        const selected = s.selectedName ? model.findElement(s.schema, s.selectedName) : null;
        const parentName =
          selected && model.isContainerType(selected.type) ? selected.name : undefined;
        const { schema, name } = model.addElement(s.schema, type, {
          pageIndex: s.activePage,
          parentName,
        });
        return { schema, selectedName: name, selectedNames: new Set([name]), dirty: true };
      }),

    insertElement: (el) =>
      set((s) => {
        const name = model.nextName(s.schema);
        const stamped = { ...el, name };
        const pages = s.schema.pages.map((p, i) =>
          i === s.activePage ? { ...p, elements: [...p.elements, stamped] } : p,
        );
        return {
          schema: { ...s.schema, pages },
          selectedName: name,
          selectedNames: new Set([name]),
          dirty: true,
        };
      }),

    addAt: (type, target, index) =>
      set((s) => {
        const { schema, name } = model.addElementAt(s.schema, type, target, index);
        return { schema, selectedName: name, selectedNames: new Set([name]), dirty: true };
      }),

    update: (name, patch) =>
      set((s) => ({ schema: model.updateElement(s.schema, name, patch), dirty: true })),

    remove: (name) =>
      set((s) => ({
        schema: model.removeElement(s.schema, name),
        selectedName: s.selectedName === name ? null : s.selectedName,
        selectedNames: (() => {
          const next = new Set(s.selectedNames);
          next.delete(name);
          return next;
        })(),
        dirty: true,
      })),

    duplicate: (name) =>
      set((s) => {
        const result = model.duplicateElement(s.schema, name);
        return {
          schema: result.schema,
          selectedName: result.name,
          selectedNames: new Set([result.name]),
          dirty: true,
        };
      }),

    groupSelected: () =>
      set((s) => {
        if (s.selectedNames.size < 2) return {};
        const { schema, groupName } = model.groupElements(s.schema, [...s.selectedNames]);
        if (!groupName) return {};
        return {
          schema,
          selectedName: groupName,
          selectedNames: new Set([groupName]),
          dirty: true,
        };
      }),

    ungroup: (name) =>
      set((s) => {
        const { schema, childNames } = model.ungroupElement(s.schema, name);
        if (schema === s.schema) return {};
        const collapsed = new Set(s.collapsedNames);
        collapsed.delete(name);
        return {
          schema,
          selectedName: childNames[0] ?? null,
          selectedNames: new Set(childNames),
          collapsedNames: collapsed,
          dirty: true,
        };
      }),

    toggleCollapsed: (name) => {
      const next = new Set(get().collapsedNames);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      rawSet({ collapsedNames: next });
    },

    setViewportName: (name) => {
      if (get().viewportName !== name) rawSet({ viewportName: name });
    },

    startConnect: (name) => rawSet({ connectingFrom: name }),
    cancelConnect: () => rawSet({ connectingFrom: null, pendingConnection: null }),
    requestConnect: (toName) => {
      const { connectingFrom } = get();
      if (!connectingFrom || connectingFrom === toName) {
        rawSet({ connectingFrom: null });
        return;
      }
      rawSet({ connectingFrom: null, pendingConnection: { from: connectingFrom, to: toName } });
    },
    confirmConnect: (value, op) => {
      const { pendingConnection } = get();
      if (!pendingConnection) return;
      const expr = buildConnectorExpression(pendingConnection.from, op, value);
      set((s) => ({
        schema: model.updateElement(s.schema, pendingConnection.to, { visibleIf: expr }),
        dirty: true,
      }));
      rawSet({ pendingConnection: null });
    },

    duplicateSelected: () =>
      set((s) => {
        if (s.selectedNames.size === 0) return {};
        let schema = s.schema;
        const newNames: string[] = [];
        for (const name of s.selectedNames) {
          const result = model.duplicateElement(schema, name);
          schema = result.schema;
          newNames.push(result.name);
        }
        return { schema, selectedNames: new Set(newNames), selectedName: newNames[0], dirty: true };
      }),

    removeSelected: () =>
      set((s) => {
        if (s.selectedNames.size === 0) return {};
        let schema = s.schema;
        for (const name of s.selectedNames) {
          schema = model.removeElement(schema, name);
        }
        return { schema, selectedName: null, selectedNames: new Set<string>(), dirty: true };
      }),

    setRequiredSelected: (required) =>
      set((s) => {
        if (s.selectedNames.size === 0) return {};
        let schema = s.schema;
        for (const name of s.selectedNames) {
          schema = model.updateElement(schema, name, { required });
        }
        return { schema, dirty: true };
      }),

    moveBy: (name, delta) =>
      set((s) => ({ schema: model.moveBy(s.schema, name, delta), dirty: true })),

    moveTo: (name, index) =>
      set((s) => ({ schema: model.moveElement(s.schema, name, index), dirty: true })),

    moveInto: (name, target, index) =>
      set((s) => {
        const schema = model.moveElementTo(s.schema, name, target, index);
        return schema === s.schema ? {} : { schema, dirty: true };
      }),

    addOption: (name) => set((s) => ({ schema: model.addOption(s.schema, name), dirty: true })),

    updateOption: (name, index, patch) =>
      set((s) => ({ schema: model.updateOption(s.schema, name, index, patch), dirty: true })),

    removeOption: (name, index) =>
      set((s) => ({ schema: model.removeOption(s.schema, name, index), dirty: true })),

    addRow: (name) => set((s) => ({ schema: model.addRow(s.schema, name), dirty: true })),
    updateRow: (name, index, patch) =>
      set((s) => ({ schema: model.updateRow(s.schema, name, index, patch), dirty: true })),
    removeRow: (name, index) =>
      set((s) => ({ schema: model.removeRow(s.schema, name, index), dirty: true })),

    addColumn: (name) => set((s) => ({ schema: model.addColumn(s.schema, name), dirty: true })),
    updateColumn: (name, index, patch) =>
      set((s) => ({ schema: model.updateColumn(s.schema, name, index, patch), dirty: true })),
    removeColumn: (name, index) =>
      set((s) => ({ schema: model.removeColumn(s.schema, name, index), dirty: true })),

    setActivePage: (index) =>
      set({ activePage: index, selectedName: null, selectedNames: new Set<string>() }),

    addPage: () =>
      set((s) => {
        const { schema, index } = model.addPage(s.schema);
        return { schema, activePage: index, selectedName: null, dirty: true };
      }),

    removePage: (index) =>
      set((s) => {
        const schema = model.removePage(s.schema, index);
        return {
          schema,
          activePage: Math.min(s.activePage, schema.pages.length - 1),
          selectedName: null,
          selectedNames: new Set<string>(),
          dirty: true,
        };
      }),

    renamePage: (index, title) =>
      set((s) => ({ schema: model.renamePage(s.schema, index, title), dirty: true })),

    setPageVisibleIf: (index, visibleIf) =>
      set((s) => ({ schema: model.setPageVisibleIf(s.schema, index, visibleIf), dirty: true })),

    save: async () => {
      const { formId, schema } = get();
      if (!isAuthenticated()) {
        set({ status: "error", error: NOT_SIGNED_IN });
        return;
      }
      set({ status: "saving", error: null });
      try {
        if (formId) {
          await api.saveDraft(formId, schema);
          set({ status: "idle", dirty: false });
        } else {
          // First save of a brand-new form: place it in a project and persist its id.
          const projectId = await resolveProjectId();
          const created = await api.createForm(projectId, schema);
          set({ formId: created.id, projectId, status: "idle", dirty: false });
        }
      } catch (err) {
        set({ status: "error", error: (err as Error).message });
      }
    },

    publish: async () => {
      set({ status: "publishing", error: null });
      await get().save(); // creates-or-updates and resolves formId
      if (get().status === "error") return;
      const { formId } = get();
      if (!formId) return;
      set({ status: "publishing" });
      try {
        await api.publish(formId);
        set({ status: "idle", dirty: false });
      } catch (err) {
        set({ status: "error", error: (err as Error).message });
      }
    },
  };
});

import { api, isAuthenticated } from "@/api/client";
import * as model from "@/features/builder/model";
import type {
  Choice,
  Element,
  ElementType,
  FormSchema,
  FormSettings,
  Theme,
} from "@/types/form-schema";
import { create } from "zustand";

type Status = "idle" | "loading" | "saving" | "publishing" | "error";

const NOT_SIGNED_IN = "Please sign in to save your form.";

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
  activePage: number;
  status: Status;
  error: string | null;
  dirty: boolean;

  init: (formId: string) => Promise<void>;
  select: (name: string | null) => void;
  setTitle: (title: string) => void;
  setTheme: (patch: Partial<Theme>) => void;
  setSettings: (patch: Partial<FormSettings>) => void;

  add: (type: ElementType) => void;
  update: (name: string, patch: Partial<Element>) => void;
  remove: (name: string) => void;
  duplicate: (name: string) => void;
  moveBy: (name: string, delta: number) => void;
  moveTo: (name: string, index: number) => void;

  addOption: (name: string) => void;
  updateOption: (name: string, index: number, patch: Partial<Choice>) => void;
  removeOption: (name: string, index: number) => void;

  addRow: (name: string) => void;
  updateRow: (name: string, index: number, patch: Partial<Choice>) => void;
  removeRow: (name: string, index: number) => void;
  addColumn: (name: string) => void;
  updateColumn: (name: string, index: number, patch: Partial<Choice>) => void;
  removeColumn: (name: string, index: number) => void;

  setActivePage: (index: number) => void;
  addPage: () => void;
  removePage: (index: number) => void;
  renamePage: (index: number, title: string) => void;

  save: () => Promise<void>;
  publish: () => Promise<void>;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  formId: null,
  projectId: null,
  schema: model.createEmptyForm(),
  selectedName: null,
  activePage: 0,
  status: "idle",
  error: null,
  dirty: false,

  init: async (formId) => {
    if (formId === "new") {
      set({
        formId: null,
        projectId: null,
        schema: model.createEmptyForm(),
        selectedName: null,
        activePage: 0,
        dirty: false,
      });
      return;
    }
    set({ status: "loading", error: null });
    try {
      const form = await api.getForm(formId);
      set({
        formId,
        projectId: form.project_id,
        schema: form.draft_content as FormSchema,
        selectedName: null,
        activePage: 0,
        status: "idle",
        dirty: false,
      });
    } catch (err) {
      // Fall back to an empty draft so the builder is still usable offline.
      set({ status: "error", error: (err as Error).message, schema: model.createEmptyForm() });
    }
  },

  select: (name) => set({ selectedName: name }),

  setTitle: (title) => set((s) => ({ schema: { ...s.schema, title }, dirty: true })),

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
        if (merged[k as keyof FormSettings] === undefined || merged[k as keyof FormSettings] === "")
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
      return { schema, selectedName: name, dirty: true };
    }),

  update: (name, patch) =>
    set((s) => ({ schema: model.updateElement(s.schema, name, patch), dirty: true })),

  remove: (name) =>
    set((s) => ({
      schema: model.removeElement(s.schema, name),
      selectedName: s.selectedName === name ? null : s.selectedName,
      dirty: true,
    })),

  duplicate: (name) =>
    set((s) => {
      const result = model.duplicateElement(s.schema, name);
      return { schema: result.schema, selectedName: result.name, dirty: true };
    }),

  moveBy: (name, delta) =>
    set((s) => ({ schema: model.moveBy(s.schema, name, delta), dirty: true })),

  moveTo: (name, index) =>
    set((s) => ({ schema: model.moveElement(s.schema, name, index), dirty: true })),

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

  setActivePage: (index) => set({ activePage: index, selectedName: null }),

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
        dirty: true,
      };
    }),

  renamePage: (index, title) =>
    set((s) => ({ schema: model.renamePage(s.schema, index, title), dirty: true })),

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
}));

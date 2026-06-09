import { api, isAuthenticated } from "@/api/client";
import * as model from "@/features/builder/model";
import type { Choice, Element, ElementType, FormSchema } from "@/types/form-schema";
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
  schema: FormSchema;
  selectedName: string | null;
  status: Status;
  error: string | null;
  dirty: boolean;

  init: (formId: string) => Promise<void>;
  select: (name: string | null) => void;
  setTitle: (title: string) => void;

  add: (type: ElementType) => void;
  update: (name: string, patch: Partial<Element>) => void;
  remove: (name: string) => void;
  duplicate: (name: string) => void;
  moveBy: (name: string, delta: number) => void;
  moveTo: (name: string, index: number) => void;

  addOption: (name: string) => void;
  updateOption: (name: string, index: number, patch: Partial<Choice>) => void;
  removeOption: (name: string, index: number) => void;

  save: () => Promise<void>;
  publish: () => Promise<void>;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  formId: null,
  schema: model.createEmptyForm(),
  selectedName: null,
  status: "idle",
  error: null,
  dirty: false,

  init: async (formId) => {
    if (formId === "new") {
      set({ formId: null, schema: model.createEmptyForm(), selectedName: null, dirty: false });
      return;
    }
    set({ status: "loading", error: null });
    try {
      const form = await api.getForm(formId);
      set({
        formId,
        schema: form.draft_content as FormSchema,
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

  add: (type) =>
    set((s) => {
      const { schema, name } = model.addElement(s.schema, type);
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
        set({ formId: created.id, status: "idle", dirty: false });
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

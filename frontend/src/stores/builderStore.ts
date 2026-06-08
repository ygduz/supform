import { create } from "zustand";
import type { Element, ElementType, FormSchema } from "@/types/form-schema";

/** In-memory builder state. Persistence to the backend draft is wired in M2. */
interface BuilderState {
  schema: FormSchema;
  addElement: (type: ElementType) => void;
  updateSchema: (schema: FormSchema) => void;
}

const EMPTY: FormSchema = {
  schemaVersion: "1.0",
  name: "untitled_form",
  title: "Untitled form",
  pages: [{ name: "page1", elements: [] }],
};

let counter = 0;

export const useBuilderStore = create<BuilderState>((set) => ({
  schema: EMPTY,
  addElement: (type) =>
    set((state) => {
      counter += 1;
      const el: Element = { type, name: `q${counter}`, label: `Question ${counter}` };
      if (type === "single_choice" || type === "multi_choice" || type === "dropdown") {
        el.options = [{ value: "option_1", label: "Option 1" }];
      }
      const pages = structuredClone(state.schema.pages);
      pages[0].elements.push(el);
      return { schema: { ...state.schema, pages } };
    }),
  updateSchema: (schema) => set({ schema }),
}));

import type { FormSchema } from "@/types/form-schema";

/**
 * "My templates" — forms the user saved as personal starting points, kept in
 * localStorage (no backend needed). Each is just a name + a schema snapshot.
 */
export interface SavedTemplate {
  id: string;
  name: string;
  schema: FormSchema;
  savedAt: string;
}

const KEY = "supform.myTemplates";

export function listMyTemplates(): SavedTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SavedTemplate[]) : [];
  } catch {
    return [];
  }
}

function write(items: SavedTemplate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage disabled / full — saving a template is best-effort */
  }
}

export function saveMyTemplate(name: string, schema: FormSchema): SavedTemplate {
  const item: SavedTemplate = {
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled template",
    schema: structuredClone(schema),
    savedAt: new Date().toISOString(),
  };
  write([item, ...listMyTemplates()]);
  return item;
}

export function deleteMyTemplate(id: string): void {
  write(listMyTemplates().filter((t) => t.id !== id));
}

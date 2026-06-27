import { localize } from "@/lib/i18n";
import type { FormSchema } from "@/types/form-schema";
import type { NavigateFunction } from "react-router-dom";
import { formToText } from "../import/textForm";
import { saveMyTemplate } from "../templates/myTemplates";

/** Trigger a client-side file download of `content` named after the form. */
function download(schema: FormSchema, content: string, mime: string, ext: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${schema.name || "form"}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download the form as a pretty-printed JSON schema. */
export function exportFormJson(schema: FormSchema) {
  download(schema, JSON.stringify(schema, null, 2), "application/json", "json");
}

/** Download the form as the human-readable text format. */
export function exportFormText(schema: FormSchema) {
  download(schema, formToText(schema), "text/plain", "txt");
}

/** Parse a JSON file as a form schema, load it as a new draft, and navigate there. */
export async function importFormJson(
  file: File,
  loadTemplate: (schema: FormSchema) => void,
  navigate: NavigateFunction,
) {
  try {
    const parsed = JSON.parse(await file.text()) as FormSchema;
    if (!parsed || !Array.isArray(parsed.pages)) throw new Error("Not a Supform form schema.");
    loadTemplate(parsed);
    navigate("/builder/new");
  } catch (err) {
    window.alert(`Could not import: ${(err as Error).message}`);
  }
}

/** Prompt for a name and save the current form to the user's local template library. */
export function saveFormAsTemplate(schema: FormSchema) {
  const name = window.prompt("Save this form as a template named:", localize(schema.title));
  if (name === null) return;
  saveMyTemplate(name, schema);
  window.alert("Saved to My templates.");
}

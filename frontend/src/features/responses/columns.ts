/**
 * Flatten a form schema into table columns for the responses view.
 *
 * Mirrors the backend exporter's column rules (app/exporters/flatten.py) so the in-app
 * table lines up with CSV/XLSX downloads: groups are transparent, a matrix expands to one
 * column per row, multi-choice joins into a single cell, and a repeat is shown as JSON.
 */
import { isPresentationalType } from "@/lib/fieldTypes";
import { localize } from "@/lib/i18n";
import type { Choice, Element, FormSchema } from "@/types/form-schema";

export interface Column {
  key: string;
  label: string;
  value: (answers: Record<string, unknown>) => string;
}

const elementLabel = (el: Element): string => localize(el.label) || el.name;
const choiceLabel = (c: Choice): string => localize(c.label) || String(c.value);

function format(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(format).join("; ");
  if (typeof value === "object") {
    // File-reference answers render as their filename.
    const ref = value as { filename?: string };
    if (typeof ref.filename === "string") return ref.filename;
    return JSON.stringify(value);
  }
  return String(value);
}

export function buildColumns(schema: FormSchema): Column[] {
  const columns: Column[] = [];

  const walk = (elements: Element[]) => {
    for (const el of elements) {
      if (isPresentationalType(el.type)) continue;

      if (el.type === "group") {
        walk(el.elements ?? []);
        continue;
      }

      if (el.type === "matrix") {
        for (const row of el.rows ?? []) {
          const rowKey = String(row.value);
          columns.push({
            key: `${el.name}/${rowKey}`,
            label: `${elementLabel(el)} – ${choiceLabel(row)}`,
            value: (answers) => {
              const cell = answers[el.name] as Record<string, unknown> | undefined;
              return format(cell?.[rowKey]);
            },
          });
        }
        continue;
      }

      if (el.type === "repeat") {
        // Show a compact summary: "N entries" for the main table; full detail in the
        // expanded view or JSON/XLSX export.
        columns.push({
          key: el.name,
          label: elementLabel(el),
          value: (answers) => {
            const instances = answers[el.name];
            if (!Array.isArray(instances) || instances.length === 0) return "";
            return `${instances.length} ${instances.length === 1 ? "entry" : "entries"}`;
          },
        });
        continue;
      }

      columns.push({
        key: el.name,
        label: elementLabel(el),
        value: (answers) => format(answers[el.name]),
      });
    }
  };

  walk(schema.pages.flatMap((p) => p.elements));
  return columns;
}

/** Per-choice-field value distribution for the summary panel. */
export interface FieldSummary {
  name: string;
  label: string;
  counts: Array<{ label: string; count: number }>;
}

// Broader than model.isChoiceType: boolean and scale also produce discrete-count distributions.
const CHOICE_TYPES = new Set(["single_choice", "multi_choice", "dropdown", "boolean", "scale"]);

export function buildSummaries(
  schema: FormSchema,
  rows: Array<{ answers: Record<string, unknown> }>,
): FieldSummary[] {
  const summaries: FieldSummary[] = [];

  const walk = (elements: Element[]) => {
    for (const el of elements) {
      if (el.type === "group") {
        walk(el.elements ?? []);
        continue;
      }
      if (!CHOICE_TYPES.has(el.type)) continue;

      const counts = new Map<string, number>();
      const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);

      for (const row of rows) {
        const answer = row.answers[el.name];
        if (answer === undefined || answer === null || answer === "") continue;
        if (Array.isArray(answer)) for (const v of answer) bump(labelFor(el, v));
        else bump(labelFor(el, answer));
      }

      if (counts.size > 0) {
        summaries.push({
          name: el.name,
          label: elementLabel(el),
          counts: [...counts.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count),
        });
      }
    }
  };

  walk(schema.pages.flatMap((p) => p.elements));
  return summaries;
}

function labelFor(el: Element, value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const match = (el.options ?? []).find((o) => o.value === value);
  return match ? choiceLabel(match) : String(value);
}

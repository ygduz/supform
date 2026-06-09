import type { ElementType } from "@/types/form-schema";

/** The question types offered in the builder palette. */
export const ELEMENT_PALETTE: { type: ElementType; label: string; icon: string }[] = [
  { type: "text", label: "Short text", icon: "✏️" },
  { type: "longtext", label: "Paragraph", icon: "📝" },
  { type: "email", label: "Email", icon: "✉️" },
  { type: "single_choice", label: "Single choice", icon: "🔘" },
  { type: "multi_choice", label: "Multiple choice", icon: "☑️" },
  { type: "dropdown", label: "Dropdown", icon: "🔽" },
  { type: "boolean", label: "Yes / no", icon: "🔀" },
  { type: "rating", label: "Rating", icon: "⭐" },
  { type: "scale", label: "Scale", icon: "📊" },
  { type: "number", label: "Number", icon: "🔢" },
  { type: "date", label: "Date", icon: "📅" },
  { type: "matrix", label: "Matrix", icon: "▦" },
  { type: "file", label: "File upload", icon: "📎" },
  { type: "group", label: "Section", icon: "📂" },
  { type: "repeat", label: "Repeating group", icon: "🔁" },
];

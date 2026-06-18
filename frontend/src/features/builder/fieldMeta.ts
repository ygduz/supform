import type { ElementType } from "@/types/form-schema";

/**
 * Single source of truth for per-field-type metadata.
 *
 * Every place that needs to describe a question type — the palette, the canvas card,
 * the Map panel chips, the default label of a freshly-added field — reads from here.
 * Add a new type once, in `FIELDS`, and it shows up everywhere with a label, icon,
 * colour and abbreviation instead of degrading to a generic "Question" / "?" fallback.
 */
export interface FieldMeta {
  /** Short palette label, e.g. "Short text". */
  label: string;
  /** Palette emoji/glyph. */
  icon: string;
  /** Accent colour used by the Map panel chip. */
  color: string;
  /** Compact glyph shown inside the Map panel chip. */
  abbr: string;
  /** Label given to a newly-added field of this type. */
  defaultLabel: string;
}

/** Ordered registry — the array order is the palette order. */
export const FIELDS: { type: ElementType; meta: FieldMeta }[] = [
  {
    type: "text",
    meta: {
      label: "Short text",
      icon: "✏️",
      color: "#3b82f6",
      abbr: "Aa",
      defaultLabel: "Short text question",
    },
  },
  {
    type: "longtext",
    meta: {
      label: "Paragraph",
      icon: "📝",
      color: "#3b82f6",
      abbr: "§",
      defaultLabel: "Long answer question",
    },
  },
  {
    type: "email",
    meta: {
      label: "Email",
      icon: "✉️",
      color: "#3b82f6",
      abbr: "@",
      defaultLabel: "Email question",
    },
  },
  {
    type: "phone",
    meta: {
      label: "Phone",
      icon: "📞",
      color: "#3b82f6",
      abbr: "☎",
      defaultLabel: "Phone question",
    },
  },
  {
    type: "url",
    meta: {
      label: "Website URL",
      icon: "🔗",
      color: "#3b82f6",
      abbr: "//",
      defaultLabel: "Website question",
    },
  },
  {
    type: "single_choice",
    meta: {
      label: "Single choice",
      icon: "🔘",
      color: "#10b981",
      abbr: "◉",
      defaultLabel: "Single choice question",
    },
  },
  {
    type: "multi_choice",
    meta: {
      label: "Multiple choice",
      icon: "☑️",
      color: "#10b981",
      abbr: "☑",
      defaultLabel: "Multiple choice question",
    },
  },
  {
    type: "dropdown",
    meta: {
      label: "Dropdown",
      icon: "🔽",
      color: "#10b981",
      abbr: "▾",
      defaultLabel: "Dropdown question",
    },
  },
  {
    type: "boolean",
    meta: {
      label: "Yes / no",
      icon: "🔀",
      color: "#06b6d4",
      abbr: "Y/N",
      defaultLabel: "Yes / no question",
    },
  },
  {
    type: "rating",
    meta: {
      label: "Rating",
      icon: "⭐",
      color: "#eab308",
      abbr: "★",
      defaultLabel: "Rating question",
    },
  },
  {
    type: "scale",
    meta: {
      label: "Scale",
      icon: "📊",
      color: "#eab308",
      abbr: "—",
      defaultLabel: "Scale question",
    },
  },
  {
    type: "number",
    meta: {
      label: "Number",
      icon: "🔢",
      color: "#f59e0b",
      abbr: "1",
      defaultLabel: "Number question",
    },
  },
  {
    type: "integer",
    meta: {
      label: "Integer",
      icon: "#",
      color: "#f59e0b",
      abbr: "#",
      defaultLabel: "Whole number question",
    },
  },
  {
    type: "decimal",
    meta: {
      label: "Decimal",
      icon: "0.0",
      color: "#f59e0b",
      abbr: "0.",
      defaultLabel: "Decimal question",
    },
  },
  {
    type: "date",
    meta: { label: "Date", icon: "📅", color: "#8b5cf6", abbr: "d", defaultLabel: "Date question" },
  },
  {
    type: "date_range",
    meta: {
      label: "Date range",
      icon: "🗓️",
      color: "#8b5cf6",
      abbr: "↔",
      defaultLabel: "Date range question",
    },
  },
  {
    type: "time",
    meta: { label: "Time", icon: "⏰", color: "#8b5cf6", abbr: "t", defaultLabel: "Time question" },
  },
  {
    type: "datetime",
    meta: {
      label: "Date & time",
      icon: "📆",
      color: "#8b5cf6",
      abbr: "dt",
      defaultLabel: "Date & time question",
    },
  },
  {
    type: "note",
    meta: {
      label: "Note / info text",
      icon: "ℹ️",
      color: "#94a3b8",
      abbr: "i",
      defaultLabel: "Information",
    },
  },
  {
    type: "html",
    meta: {
      label: "HTML block",
      icon: "</>",
      color: "#94a3b8",
      abbr: "<>",
      defaultLabel: "Informational text",
    },
  },
  {
    type: "ranking",
    meta: {
      label: "Ranking",
      icon: "↕",
      color: "#10b981",
      abbr: "↕",
      defaultLabel: "Ranking question",
    },
  },
  {
    type: "matrix",
    meta: {
      label: "Matrix",
      icon: "▦",
      color: "#6366f1",
      abbr: "⊞",
      defaultLabel: "Matrix question",
    },
  },
  {
    type: "signature",
    meta: {
      label: "Signature",
      icon: "✍️",
      color: "#6b7280",
      abbr: "sig",
      defaultLabel: "Signature",
    },
  },
  {
    type: "address",
    meta: { label: "Address", icon: "🏠", color: "#0d9488", abbr: "⌂", defaultLabel: "Address" },
  },
  {
    type: "file",
    meta: {
      label: "File upload",
      icon: "📎",
      color: "#6b7280",
      abbr: "f",
      defaultLabel: "File upload",
    },
  },
  {
    type: "image",
    meta: {
      label: "Image upload",
      icon: "🖼️",
      color: "#6b7280",
      abbr: "img",
      defaultLabel: "Image upload",
    },
  },
  {
    type: "geopoint",
    meta: {
      label: "Location (point)",
      icon: "📍",
      color: "#ef4444",
      abbr: "⌖",
      defaultLabel: "Location",
    },
  },
  {
    type: "geotrace",
    meta: {
      label: "Location (line)",
      icon: "〰️",
      color: "#ef4444",
      abbr: "〰",
      defaultLabel: "Location path",
    },
  },
  {
    type: "geoshape",
    meta: {
      label: "Location (area)",
      icon: "⬡",
      color: "#ef4444",
      abbr: "⬡",
      defaultLabel: "Location area",
    },
  },
  {
    type: "barcode",
    meta: {
      label: "Barcode / QR",
      icon: "▥",
      color: "#6b7280",
      abbr: "▥",
      defaultLabel: "Barcode / QR",
    },
  },
  {
    type: "calculated",
    meta: {
      label: "Calculated",
      icon: "🧮",
      color: "#d97706",
      abbr: "ƒ",
      defaultLabel: "Calculated value",
    },
  },
  {
    type: "start",
    meta: {
      label: "Start time",
      icon: "⏱",
      color: "#94a3b8",
      abbr: "⏱",
      defaultLabel: "Start time",
    },
  },
  {
    type: "end",
    meta: { label: "End time", icon: "⏹", color: "#94a3b8", abbr: "⏹", defaultLabel: "End time" },
  },
  {
    type: "today",
    meta: {
      label: "Today's date",
      icon: "📅",
      color: "#94a3b8",
      abbr: "📅",
      defaultLabel: "Today's date",
    },
  },
  {
    type: "deviceid",
    meta: {
      label: "Device ID",
      icon: "📱",
      color: "#94a3b8",
      abbr: "📱",
      defaultLabel: "Device ID",
    },
  },
  {
    type: "username",
    meta: { label: "Username", icon: "👤", color: "#94a3b8", abbr: "👤", defaultLabel: "Username" },
  },
  {
    type: "group",
    meta: { label: "Section", icon: "📂", color: "#059669", abbr: "§", defaultLabel: "Section" },
  },
  {
    type: "repeat",
    meta: {
      label: "Repeating group",
      icon: "🔁",
      color: "#7c3aed",
      abbr: "↻",
      defaultLabel: "Repeating group",
    },
  },
];

/** Fast lookup by type, derived from the ordered registry. */
const BY_TYPE: Partial<Record<ElementType, FieldMeta>> = Object.fromEntries(
  FIELDS.map(({ type, meta }) => [type, meta]),
);

const FALLBACK: FieldMeta = {
  label: "Question",
  icon: "❓",
  color: "#94a3b8",
  abbr: "?",
  defaultLabel: "Question",
};

/** Metadata for a type, falling back to a neutral default for unknown/custom types. */
export function fieldMeta(type: ElementType): FieldMeta {
  return BY_TYPE[type] ?? FALLBACK;
}

export const fieldColor = (type: ElementType): string => fieldMeta(type).color;
export const fieldAbbr = (type: ElementType): string => fieldMeta(type).abbr;
export const defaultLabelFor = (type: ElementType): string => fieldMeta(type).defaultLabel;

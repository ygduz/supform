import type { ElementType } from "@/types/form-schema";
import { FIELDS } from "./fieldMeta";

/**
 * The question types offered in the builder palette, in display order.
 * Derived from the {@link FIELDS} registry — the single source of truth for type metadata.
 */
export const ELEMENT_PALETTE: { type: ElementType; label: string; icon: string }[] = FIELDS.map(
  ({ type, meta }) => ({ type, label: meta.label, icon: meta.icon }),
);

/**
 * The everyday types that cover ~80% of forms, ordered by real-world frequency. Showing
 * just these up front (and tucking the rest under "More types") keeps a first-time user
 * from drowning in 30+ choices — the MS-Forms two-tier model.
 */
export const COMMON_TYPES: readonly ElementType[] = [
  "text",
  "longtext",
  "single_choice",
  "multi_choice",
  "dropdown",
  "date",
  "number",
  "rating",
  "email",
];

const COMMON_SET = new Set<ElementType>(COMMON_TYPES);

/** Common types, in the curated order above. */
export const COMMON_PALETTE = COMMON_TYPES.map((type) => {
  const item = ELEMENT_PALETTE.find((p) => p.type === type);
  // COMMON_TYPES is a hand-curated subset of FIELDS, so this always resolves.
  return item as { type: ElementType; label: string; icon: string };
});

/** Everything else, in registry order — surfaced under a "More types" disclosure. */
export const ADVANCED_PALETTE = ELEMENT_PALETTE.filter((p) => !COMMON_SET.has(p.type));

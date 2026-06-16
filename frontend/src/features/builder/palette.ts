import type { ElementType } from "@/types/form-schema";
import { FIELDS } from "./fieldMeta";

/**
 * The question types offered in the builder palette, in display order.
 * Derived from the {@link FIELDS} registry — the single source of truth for type metadata.
 */
export const ELEMENT_PALETTE: { type: ElementType; label: string; icon: string }[] = FIELDS.map(
  ({ type, meta }) => ({ type, label: meta.label, icon: meta.icon }),
);

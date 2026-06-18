/**
 * Shared field-type predicates for code outside the builder package.
 *
 * Builder code should import directly from `../features/builder/model`; this module
 * re-exports the subset that renderer and responses code needs, keeping them free of a
 * builder dependency.
 */
export { isNumericType, isPresentationalType } from "@/features/builder/model";

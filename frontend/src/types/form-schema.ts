/**
 * TypeScript mirror of packages/form-schema/schema/form.schema.json.
 *
 * This is the frontend half of the form contract. The builder produces these objects;
 * the renderer consumes them. Keep in lock-step with the JSON Schema and the backend
 * Pydantic models (app/schemas/form_schema.py).
 */

/** Either a plain string or a { locale: text } map. */
export type I18nString = string | Record<string, string>;

/** A logic/value expression evaluated by the form engine (e.g. "age >= 18"). */
export type Expression = string;

export type ElementType =
  | "text"
  | "longtext"
  | "email"
  | "url"
  | "phone"
  | "number"
  | "integer"
  | "decimal"
  | "single_choice"
  | "multi_choice"
  | "dropdown"
  | "ranking"
  | "rating"
  | "scale"
  | "date"
  | "time"
  | "datetime"
  | "date_range"
  | "boolean"
  | "matrix"
  | "group"
  | "repeat"
  | "file"
  | "image"
  | "signature"
  | "address"
  | "geopoint"
  | "geotrace"
  | "geoshape"
  | "barcode"
  | "start"
  | "end"
  | "today"
  | "deviceid"
  | "username"
  | "calculated"
  | "hidden"
  | "note"
  | "section"
  | "html"
  // open set: custom types are allowed
  | (string & {});

export interface Choice {
  value: string | number | boolean;
  label?: I18nString;
  visibleIf?: Expression;
  /** Points awarded when this option is chosen (quiz mode). */
  score?: number;
  meta?: Record<string, unknown>;
}

/** A scored-result band shown on the thank-you screen when the score falls in [min, max]. */
export interface Outcome {
  min: number;
  max: number;
  message: I18nString;
  redirectUrl?: string;
}

export interface Validation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minSelected?: number;
  maxSelected?: number;
  expression?: Expression;
  message?: I18nString;
}

export interface RepeatSettings {
  min?: number;
  max?: number;
  addButtonText?: I18nString;
  entryLabel?: I18nString;
}

export interface Element {
  type: ElementType;
  name: string;
  label?: I18nString;
  hint?: I18nString;
  placeholder?: I18nString;
  defaultValue?: unknown;
  required?: boolean;
  readOnly?: boolean;
  visibleIf?: Expression;
  enableIf?: Expression;
  requiredIf?: Expression;
  calculate?: Expression;
  validation?: Validation;
  options?: Choice[];
  optionsFrom?: string;
  rows?: Choice[];
  columns?: Choice[];
  elements?: Element[];
  repeat?: RepeatSettings;
  meta?: Record<string, unknown>;
}

export interface NextPageRule {
  condition: Expression;
  page: string;
}

export interface Page {
  name: string;
  title?: I18nString;
  description?: I18nString;
  visibleIf?: Expression;
  /** Conditional branching: first matching rule wins; falls back to sequential if none match. */
  nextPageIf?: NextPageRule[];
  elements: Element[];
}

export interface Theme {
  preset?: string;
  primaryColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
  cornerRadius?: number;
  coverImage?: string;
  logo?: string;
  [key: string]: unknown;
}

export interface FormSettings {
  displayMode?: "paged" | "single" | "oneQuestionPerScreen";
  showProgressBar?: boolean;
  shuffleQuestions?: boolean;
  allowMultipleSubmissions?: boolean;
  requireLogin?: boolean;
  closeDate?: string;
  maxResponses?: number;
  submitButtonText?: I18nString;
  /** Heading shown on the thank-you screen (defaults to "Thank you!"). */
  confirmationTitle?: I18nString;
  confirmationMessage?: I18nString;
  /** Optional welcome screen shown before the first step (paged / one-question modes). */
  welcomeTitle?: I18nString;
  welcomeMessage?: I18nString;
  /** Where to send the respondent after submitting (auto-redirect from the thank-you screen). */
  redirectUrl?: string;
  /** Email addresses notified on each new submission. */
  notifyEmails?: string[];
  /** Score selected-option points and show an outcome on the thank-you screen. */
  quizMode?: boolean;
  outcomes?: Outcome[];
  qualityChecks?: QualityChecks;
  workflowSteps?: string[];
}

export interface QualityChecks {
  /** Submissions completed faster than this many seconds are flagged "too_fast". Default 30. */
  minDurationSeconds?: number;
  /** Geopoint answers outside [minLat, minLng, maxLat, maxLng] are flagged "geo_outlier". */
  expectedGeoBbox?: [number, number, number, number];
}

export interface FormSchema {
  schemaVersion: string;
  id?: string;
  name: string;
  title: I18nString;
  description?: I18nString;
  version?: number;
  defaultLanguage?: string;
  languages?: string[];
  theme?: Theme;
  settings?: FormSettings;
  pages: Page[];
}

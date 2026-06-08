# Form Schema Reference

The Form Schema is the heart of Supform. This page is the narrative reference; the
machine-readable definition lives in
[`packages/form-schema/schema/form.schema.json`](../packages/form-schema/schema/form.schema.json).

## Top-level shape

```jsonc
{
  "schemaVersion": "1.0",       // version of the schema FORMAT
  "name": "household_survey",    // stable machine id (slug)
  "title": "Household survey",   // human title (i18n-capable)
  "version": 1,                  // published version; submissions reference this
  "defaultLanguage": "en",
  "languages": ["en", "fr"],
  "theme": { "preset": "supform-light", "primaryColor": "#2563eb" },
  "settings": { "displayMode": "paged", "showProgressBar": true },
  "pages": [ /* Page[] */ ]
}
```

## Pages

A page is a logical screen/section. With `settings.displayMode`:
- `paged` — one page (section) at a time, with a progress bar.
- `single` — everything on one scrollable page.
- `oneQuestionPerScreen` — Typeform-style.

A page may have a `visibleIf` to skip whole sections.

## Elements

Every field/block is an **element**. The required keys are `type` and `name`.

| Key | Meaning |
|---|---|
| `type` | What kind of element (see types below). Open/extensible set. |
| `name` | Stable machine key — used in submission data **and** in logic expressions. |
| `label`, `hint`, `placeholder` | Human text (string or `{lang: text}`). |
| `required` / `requiredIf` | Mandatory, optionally conditional. |
| `visibleIf` / `enableIf` | Conditional display / enablement (relevance). |
| `calculate` | Derived value expression (recomputed server-side). |
| `validation` | Constraints (see below). |
| `options` / `optionsFrom` | Choices for choice-type elements. |
| `rows` / `columns` | For `matrix`. |
| `elements` | Children for `group` / `repeat`. |
| `repeat` | `{min, max, addButtonText}` for repeating groups. |
| `meta` | Open bag for UI-only or custom metadata (never rejected). |

### Core element types

| Category | Types |
|---|---|
| Text | `text`, `longtext`, `email`, `url`, `phone` |
| Numeric | `number`, `integer`, `decimal` |
| Choice | `single_choice`, `multi_choice`, `dropdown`, `ranking`, `rating`, `scale` |
| Date/bool | `date`, `time`, `datetime`, `boolean` |
| Complex | `matrix`, `group`, `repeat` |
| Media | `file`, `image`, `signature`, `geopoint`, `barcode` |
| Derived/layout | `calculated`, `note`, `section`, `html` |

The set is intentionally **open** — the engine treats unknown types as generic value
fields, and the frontend registry falls back to a text input. Adding a new type is a
local change in three places (JSON Schema, backend Pydantic, frontend registry).

## Validation

```jsonc
"validation": {
  "min": 0, "max": 120,            // numeric range
  "minLength": 1, "maxLength": 500, // string length
  "pattern": "^[A-Z]{3}$",          // regex
  "minSelected": 1, "maxSelected": 3, // multi-choice count
  "expression": "value <= other_field", // custom rule (`value` = this answer)
  "message": "Custom error text"
}
```

## Logic expressions

`visibleIf`, `enableIf`, `requiredIf`, `calculate`, and `validation.expression` are
**expression strings** evaluated by the form engine
([`backend/app/form_engine/expressions.py`](../backend/app/form_engine/expressions.py)).

Grammar (a safe subset, SurveyJS/XLSForm-relevance-like):

```
age >= 18 and region == 'north'
member_count * 2
selected(languages, 'fr')         // true if 'fr' is among chosen options
count(languages) >= 2
not consent
```

- Identifiers resolve to other fields' values by `name` (missing → `null`/`None`).
- Operators: `+ - * / % **`, `== != < <= > >=`, `in`, `and or not`.
- Helper functions: `selected`, `count`/`len`, `min`, `max`, `abs`, `round`, casts.
- **No** attribute access, arbitrary calls, imports, or comprehensions — evaluated via a
  vetted AST walker, never `eval`.

The same grammar is intended to run client-side for live interactivity; the server is
always authoritative (it re-validates and recomputes every submission).

## Submissions

A submission is a JSON object keyed by element `name`:

```json
{ "region": "north", "age": 34, "is_head": "yes" }
```

Validation is **logic-aware**: a field hidden by `visibleIf` is neither required nor
stored; `calculate` fields are recomputed server-side so derived values can't be spoofed.

## Versioning

Publishing freezes the current draft into an immutable `FormVersion`. Each submission
records `form_version`, so historical data stays interpretable as the form evolves.

---

## Relationship to XLSForm / ODK (interoperability)

KoboToolbox and ODK use **XLSForm** (a spreadsheet) which compiles to **XForm** (XML).
Supform's importer maps that model onto this schema. Key mappings:

| XLSForm | Supform |
|---|---|
| `text` | `text` |
| `integer` / `decimal` | `integer` / `decimal` |
| `select_one <list>` | `single_choice` (options from `<list>`) |
| `select_multiple <list>` | `multi_choice` |
| `note` | `note` |
| `begin group` … `end group` | `group` with nested `elements` |
| `begin repeat` … `end repeat` | `repeat` with nested `elements` |
| `geopoint` | `geopoint` |
| `image` / `audio` / `video` | `image` / `file` |
| `calculate` | `calculated` (`calculate` expr) |
| `relevant` column | `visibleIf` |
| `constraint` column | `validation.expression` (+ `constraint_message`) |
| `required` column | `required` / `requiredIf` |
| `choice_filter` | choice `visibleIf` (cascading selects) |

**Why import instead of adopt?** XLSForm is powerful but rigid (fixed spreadsheet grid,
XPath logic, limited layout/theming). By importing into a richer native JSON model,
Supform stays compatible with the humanitarian-data ecosystem while being free to offer
better UX, theming, and question types. See
[`backend/app/importers/`](../backend/app/importers).

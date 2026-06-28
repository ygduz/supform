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

## Settings

`settings` carries form-level behavior and presentation:
- `displayMode`, `showProgressBar`, `shuffleQuestions`, `shuffleOptions` — `shuffle*` randomize
  question / option order per respondent (display-only; storage & grading are unaffected).
- collection: `requireLogin`, `allowMultipleSubmissions`, `acceptingResponses`, `openDate`,
  `closeDate`, `maxResponses`. `acceptingResponses: false` is a master off switch; `openDate` /
  `closeDate` bound the response window. All three are enforced server-side at submit time.
- copy: `submitButtonText`, `confirmationTitle`, `confirmationMessage` (i18n)
- `welcomeTitle` / `welcomeMessage` (i18n) — an optional welcome screen shown before the
  first step in `paged` / `oneQuestionPerScreen` modes.
- `redirectUrl` — send the respondent here after submitting (auto-redirect from the
  thank-you screen).
- `notifyEmails` — addresses emailed on each new submission.
- `workflowSteps` — named stages for the review/approval workflow.
- quiz: `quizMode`, `showCorrectAnswers`, `outcomes` (see [Quizzes](#quizzes)).
- `qualityChecks` — `{ minDurationSeconds, expectedGeoBbox }` thresholds for automated flags.

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
| `points` / `correctAnswer` / `feedback` | Quiz grading (see [Quizzes](#quizzes)). |
| `meta` | Open bag for UI-only or custom metadata (never rejected). |

### Core element types

| Category | Types |
|---|---|
| Text | `text`, `longtext`, `email`, `url`, `phone` |
| Numeric | `number`, `integer`, `decimal` |
| Choice | `single_choice`, `multi_choice`, `dropdown`, `ranking`, `rating`, `scale` |
| Date/bool | `date`, `time`, `datetime`, `date_range`, `boolean` |
| Complex | `matrix`, `group`, `repeat` |
| Media/geo | `file`, `image`, `signature`, `address`, `geopoint`, `geotrace`, `geoshape`, `barcode` |
| Metadata | `start`, `end`, `today`, `deviceid`, `username` (auto-captured) |
| Derived/layout | `calculated`, `hidden`, `note`, `section`, `html` |

The set is intentionally **open** — the engine treats unknown types as generic value
fields, and the frontend registry falls back to a text input. The schema contract lives in
**four** places that must stay in sync (per [`CLAUDE.md`](../CLAUDE.md)): the JSON Schema,
the backend Pydantic models, the frontend TypeScript types, and the SDK builders — plus the
frontend renderer registry for a new type's widget.

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

## Quizzes

Set `settings.quizMode: true` to grade responses. Two grading models, usable together:

**Correct-answer grading.** Mark the right answer(s) and award points:

```jsonc
// a choice question — flag the correct option(s)
{ "type": "single_choice", "name": "capital", "label": "Capital of France?",
  "points": 2,                                  // points for a correct answer (default 1)
  "options": [ { "value": "paris", "correct": true }, { "value": "lyon" } ],
  "feedback": { "correct": "Oui!", "incorrect": "It's Paris." } }

// a text/number question — give an answer key (text is matched case-insensitively, trimmed)
{ "type": "text", "name": "river", "label": "Longest river?", "correctAnswer": "Nile" }
```

Multi-select questions are correct only when the chosen set **exactly** matches the flagged
options. Grading is computed **server-side** on submit and returned on the submission as
`grading` (`{ earnedPoints, maxPoints, correctCount, gradedCount, perField }`), plus
`score` / `max_score` / `correct_count` / `graded_count`.

**Option scores + outcomes.** For weighted/personality-style quizzes, give options a numeric
`score`; the sum is the `_score`. Map any total to a message with `outcomes`:

```jsonc
"settings": { "quizMode": true, "outcomes": [
  { "min": 0, "max": 2, "message": "Keep studying" },
  { "min": 3, "max": 5, "message": "Great job", "redirectUrl": "/passed" }
] }
```

Outcomes match on **earned points** for correct-answer quizzes, otherwise on the additive
`_score`. Respondents see a graded results breakdown on the thank-you screen unless
`settings.showCorrectAnswers` is `false`. The dashboard shows a score column and a score
distribution + per-question correct-rate. From the SDK: `fields.Quiz(...)`, `fields.Outcome(...)`,
and `fields.Option(value, correct=True, score=N)`.

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
- **Excel-style functions** — `IF`, `SUM`, `ROUND`, `CONCAT`, `VLOOKUP`-style `LOOKUP`,
  and ~40 more (case-insensitive). Full catalog and examples in
  [`docs/formulas.md`](./formulas.md).
- **No** attribute access, arbitrary calls, imports, or comprehensions — evaluated via a
  vetted AST walker, never `eval`.

Calculated fields recompute in **dependency order** (a formula may reference a field
defined later in the form); circular references are detected and reported. The same
catalog runs client-side for live interactivity, but the server is always authoritative
(it re-validates and recomputes every submission).

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

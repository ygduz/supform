# Supform Form Schema

This package is the **single source of truth** for what a Supform form *is*.

A Supform form is a JSON document. The backend (Pydantic), the frontend (TypeScript),
and the Python SDK all conform to the schema defined here. Change the form model here
first, then propagate to those three places.

## Contents

| File | Purpose |
|---|---|
| `schema/form.schema.json` | The JSON Schema (draft 2020-12) describing a form |
| `examples/household-survey.json` | A realistic example exercising most features |
| `examples/contact-form.json` | A tiny "MS-Forms easy" example |

## Design principles

1. **Flexible by default** — open set of element `type`s; unknown layout metadata is
   preserved, not rejected.
2. **Stable machine keys** — every field has a `name` (the key used in submission data
   and in logic expressions). Labels can change freely; names are the contract.
3. **Logic is data** — `visibleIf`, `enableIf`, `requiredIf`, and `calculate` are
   string expressions evaluated by the form engine. See `docs/form-schema.md` for the
   expression grammar.
4. **i18n-ready** — any human-facing string may be either a plain string or a
   `{ "<lang>": "..." }` map.
5. **Versionable** — `version` is bumped on publish; submissions reference a version.

See [`/docs/form-schema.md`](../../docs/form-schema.md) for the narrative reference and
the comparison to XLSForm/ODK (and how the importer maps between them).

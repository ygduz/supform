# Supform Architecture

This document explains how Supform is put together, the reasoning behind the major
choices, and how the pieces fit. It is the map you should read before touching code.

## 1. Goals & non-goals

**Goals**
- **Easy** — building a form should feel like Microsoft Forms / Tally: drag, drop, type.
- **Beautiful** — a modern, themeable UI for both the builder and the filled-in form.
- **Flexible** — the form definition is open JSON, not a fixed spreadsheet grid. Rich
  question types, conditional logic, calculations, and validation are first-class.
- **Code-first too** — anything you can do in the UI you can do from the Python SDK,
  because both speak the same schema.
- **Interoperable** — import existing **XLSForm / ODK XForm** definitions (KoboToolbox,
  ODK Collect, Enketo) so people can migrate without losing work.
- **Own your data** — self-hostable, open source, standard export formats.

**Non-goals (for now)**
- Being a 1:1 drop-in replacement for the full ODK/OpenRosa server protocol.
- Heavy enterprise features (SSO/SCIM, billing) — designed for later, not built first.

## 2. The big idea: a form is data

The center of Supform is a single, well-specified JSON document — the **Form Schema**.
Everything orbits it:

- The **frontend builder** edits it.
- The **renderer** turns it into an interactive, validated form.
- The **backend** stores it (Postgres `JSONB`), versions it, and validates submissions
  against it.
- The **Python SDK** builds it from code.
- The **ODK importer** translates XLSForm/XForm *into* it.

Because the schema is the contract, the UI, the API, and code stay perfectly in sync.
The canonical definition lives in [`packages/form-schema/`](./packages/form-schema).

See [`docs/form-schema.md`](./docs/form-schema.md) for the full spec. In short, a form is:

```
Form
 ├─ metadata (id, title, version, theme, settings)
 └─ pages[]            ← logical screens / sections
     └─ elements[]     ← fields and layout blocks
         ├─ type       ← text | number | choice | date | rating | matrix | file | ...
         ├─ name       ← stable machine key (used in data & logic)
         ├─ label      ← human text (i18n-capable)
         ├─ validation ← required, min/max, regex, custom
         ├─ visibleIf  ← conditional logic expression
         └─ calculate  ← derived value expression
```

## 3. Why this stack

| Layer | Choice | Why |
|---|---|---|
| Backend framework | **FastAPI** | Async, Pydantic-native (schema validation is the whole game here), automatic OpenAPI, lighter & more flexible than Django/DRF which KOBO uses. |
| ORM / DB access | **SQLAlchemy 2.0 (async)** + Alembic | Mature, explicit, plays well with Postgres JSONB and complex queries. |
| Database | **PostgreSQL** | `JSONB` stores flexible form schemas & submissions while still allowing indexed queries. |
| Schema/validation | **Pydantic v2** | One model layer for API I/O *and* form-schema validation. |
| Async jobs | **Celery + Redis** | Exports, bulk imports, and ODK conversion run off the request path. |
| Frontend | **React + TypeScript + Vite** | Best ecosystem for a drag-and-drop builder; fast dev loop. |
| Form model | **JSON-schema-first** | Maximum flexibility; ODK import bridges the existing ecosystem. |

KOBO uses Django + DRF + a multi-repo split (`kpi`, `kobocat`, `formpack`, `enketo`).
We deliberately consolidate into one well-structured monorepo with a single schema.

## 4. Component map

### `backend/` — FastAPI service
```
app/
  core/         config, security (JWT), logging, exceptions
  db/           async engine, session, declarative base
  models/       SQLAlchemy ORM: User, Project, Form, FormVersion, Submission, ...
  schemas/      Pydantic request/response + the Form Schema models
  api/v1/       routers: auth, projects, forms, submissions, exports
  form_engine/  the heart: schema validation, logic/expression evaluation,
                submission validation, versioning
  importers/    xlsform/odk → Supform schema
  exporters/    submissions → csv / xlsx / json / (odk)
  services/     business logic that sits between API and models
  workers/      Celery tasks (export, import, notifications)
  utils/
```

### `frontend/` — React app
```
src/
  features/
    builder/    drag-and-drop form designer (edits the Form Schema)
    renderer/   takes a Form Schema → interactive, validated form
    responses/  results table, summaries, charts
    auth/       login / signup
  components/    shared UI (design system)
  api/          typed API client (generated from OpenAPI)
  stores/       state (Zustand)
  theme/        theming tokens — forms are beautiful & themeable
  types/        TypeScript mirror of the Form Schema
```

### `sdk/python/` — code-first forms
A thin, friendly Python API that builds the **same** Form Schema and talks to the API:
```python
from supform_sdk import Form, fields

form = Form("Household survey")
form.add(fields.Text("name", label="Your name", required=True))
form.add(fields.SingleChoice("region", label="Region", options=["North", "South"]))
form.add(fields.Number("age", label="Age", min=0, max=120,
                       visible_if="region == 'North'"))
form.publish(client)   # → POST to the backend
```

### `packages/form-schema/` — the contract
Language-agnostic JSON Schema + examples. Backend, frontend, and SDK all conform to it.

## 5. Request lifecycle (example: submitting a response)

1. Frontend renderer collects answers and `POST`s them to `/api/v1/forms/{id}/submissions`.
2. The API loads the form's **published version** schema.
3. `form_engine.validation` validates the submission *against that exact schema version*
   (types, required, logic-aware required, calculations).
4. A `Submission` row is stored (answers in `JSONB`, plus media references).
5. Exports are produced on demand via a Celery job → CSV/XLSX/JSON.

## 6. Versioning

Forms are immutable once a version is published. Editing creates a draft; publishing
snapshots a new `FormVersion`. Submissions always reference the version they were made
against, so analysis stays correct even as the form evolves (the same lesson KOBO learned
with `AssetVersion` / `AssetSnapshot`).

## 7. Where to go next

- Form schema spec → [`docs/form-schema.md`](./docs/form-schema.md)
- Backend internals → [`backend/README.md`](./backend/README.md)
- Frontend internals → [`frontend/README.md`](./frontend/README.md)
- Roadmap → [`ROADMAP.md`](./ROADMAP.md)

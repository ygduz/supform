# Supform

> An open-source form & survey data-collection platform — as easy as Microsoft Forms,
> as powerful as KoboToolbox, and flexible enough to drive entirely from code.

Supform lets you build beautiful forms in a drag-and-drop builder **or** define them in
Python, collect responses online and offline, and own all of your data.

It is built around a **flexible JSON form schema** (think SurveyJS / Tally) with
first-class **conditional logic**, **calculations**, and **rich question types** — while
remaining able to **import XLSForm / ODK XForm** definitions for interoperability with the
existing humanitarian-data ecosystem (KoboToolbox, ODK, Enketo).

## Why Supform?

| | MS Forms | KoboToolbox | **Supform** |
|---|:---:|:---:|:---:|
| Beautiful, easy UI | ✅ | ⚠️ | ✅ |
| Open source & self-hostable | ❌ | ✅ | ✅ |
| Flexible JSON form model | ❌ | ⚠️ (XLSForm) | ✅ |
| Define forms **in code** (Python SDK) | ❌ | ⚠️ | ✅ |
| Conditional logic / branching | ⚠️ | ✅ | ✅ |
| XLSForm / ODK import | ❌ | ✅ (native) | ✅ (import) |
| Offline collection | ❌ | ✅ | 🛣️ planned |
| Modern async API | ❌ | ❌ (Django) | ✅ (FastAPI) |

## Architecture at a glance

```
┌──────────────┐     ┌───────────────────────┐     ┌──────────────┐
│  frontend/   │ ──► │      backend/         │ ──► │  PostgreSQL  │
│ React + Vite │ API │ FastAPI + SQLAlchemy  │     │ (JSONB forms)│
│  builder &   │     │   form_engine/        │     └──────────────┘
│  renderer    │     │   importers (ODK)     │     ┌──────────────┐
└──────────────┘     │   exporters (csv/xlsx)│ ──► │ Redis/Celery │
        ▲            └───────────┬───────────┘     │ (async jobs) │
        │                        │                 └──────────────┘
        │                        ▼
┌──────────────┐        ┌──────────────────┐
│  sdk/python  │ ─────► │  packages/        │
│ code-first   │  uses  │  form-schema/     │  ← single source of truth for
│ form builder │        │  (JSON Schema)    │     the form definition format
└──────────────┘        └──────────────────┘
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`docs/`](./docs) for the full design.

## Monorepo layout

| Path | What it is |
|---|---|
| [`backend/`](./backend) | FastAPI + SQLAlchemy API, the form engine, importers/exporters |
| [`frontend/`](./frontend) | React + TypeScript (Vite) — drag-and-drop builder, renderer, results |
| [`sdk/python/`](./sdk/python) | Python SDK for defining and managing forms **in code** |
| [`packages/form-schema/`](./packages/form-schema) | The canonical JSON Schema for a Supform form |
| [`docs/`](./docs) | Architecture, schema reference, API docs, design notes |
| [`infra/`](./infra) | Docker, deployment, local dev tooling |

## Quick start (local dev)

```bash
# 1. Boot Postgres + Redis + backend + frontend
docker compose up --build

# Backend API → http://localhost:8000  (docs at /docs)
# Frontend    → http://localhost:5173
```

Or run pieces individually — see each package's `README.md`.

### Verify the full loop

With the backend running and migrations applied (`cd backend && alembic upgrade head`),
drive the entire product loop through the Python SDK:

```bash
python scripts/smoke_e2e.py
# signup → login → create project → build form in code → publish
#        → submit valid response → reject invalid (422) → list responses
```

This is the working vertical slice: code-first form definition, JSONB persistence,
logic-aware submission validation, and versioning — all end to end.

## Status

🚧 **Early scaffold.** This repository currently contains the architecture, the form
schema spec, and a structured skeleton of every package. Modules are stubbed with clear
contracts and TODOs so they can be filled in incrementally. See [`ROADMAP.md`](./ROADMAP.md).

## License

[MIT](./LICENSE)

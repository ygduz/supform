# Roadmap

A pragmatic build order. Each milestone is shippable on its own.

## M0 — Scaffold (this commit)
- [x] Monorepo structure, docs, architecture
- [x] Form Schema spec (`packages/form-schema`)
- [x] Backend skeleton (FastAPI app factory, config, models, routers — stubbed)
- [x] Frontend skeleton (Vite + React + TS, feature folders)
- [x] Python SDK skeleton
- [x] Docker compose for local dev

## M1 — Core form engine (backend)
- [x] Pydantic models for the full Form Schema + validation
- [x] Submission validation against a schema version
- [x] Expression/logic evaluator (`visibleIf`, `calculate`, validation rules)
- [x] CRUD API for projects, forms, versions, submissions
- [x] Auth (JWT, stdlib HS256)
- [x] Alembic migration + Postgres JSONB storage (portable to SQLite for tests)
- [x] End-to-end vertical slice verified (`scripts/smoke_e2e.py`)
- [x] Per-object permissions — ownership checks (forms/submissions/export/import)
- [ ] Sharing / roles beyond the owner
- [ ] Media/file upload handling

## M2 — Builder & renderer (frontend)
- [x] Renderer: schema → interactive validated form (client-side validation + 422 mapping)
- [~] Builder: drag-and-drop + live preview done; logic editor only `visibleIf`,
      no groups/repeats/matrix or multi-page authoring yet
- [ ] Theming system
- [x] Results table + per-field summary + CSV/XLSX/JSON export buttons

## M3 — Interoperability
- [x] XLSForm importer → Supform schema
- [ ] ODK XForm importer
- [x] CSV / XLSX / JSON exporters (currently synchronous; Celery offload still TODO)

## M4 — Collection at scale
- [ ] Public form links, access control, response limits
- [ ] Offline / PWA collection
- [ ] Webhooks & integrations
- [ ] File/media attachments via S3

## M5 — Polish
- [ ] i18n / multi-language forms
- [ ] Templates gallery
- [ ] Collaboration & sharing
- [ ] Analytics dashboards

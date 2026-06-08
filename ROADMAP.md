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
- [ ] Pydantic models for the full Form Schema + validation
- [ ] Submission validation against a schema version
- [ ] Expression/logic evaluator (`visibleIf`, `calculate`, validation rules)
- [ ] CRUD API for projects, forms, versions, submissions
- [ ] Auth (JWT) + per-object permissions
- [ ] Alembic migrations + Postgres JSONB storage

## M2 — Builder & renderer (frontend)
- [ ] Renderer: schema → interactive validated form (the MS-Forms-easy experience)
- [ ] Builder: drag-and-drop, live preview, logic editor
- [ ] Theming system
- [ ] Results table + summary charts

## M3 — Interoperability
- [ ] XLSForm importer → Supform schema
- [ ] ODK XForm importer
- [ ] CSV / XLSX / JSON exporters (Celery jobs)

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

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
- [x] Sharing / roles beyond the owner (project memberships: viewer/editor/owner,
      role-gated API + Share dialog in the builder)
- [x] Media/file upload handling (local storage; S3 backend pending, M4)

## M2 — Builder & renderer (frontend)
- [x] Renderer: schema → interactive validated form (client-side validation + 422 mapping;
      groups render recursively, repeat preview still TODO)
- [x] Builder: drag-and-drop, live preview, multi-page, groups/repeats/matrix authoring,
      and a logic + validation editor (visibleIf/requiredIf/calculate, min/max/length/
      pattern/selected). Cross-container drag still TODO
- [x] Theming system (primary/background color, font, corner radius, logo/cover; live preview)
- [x] Results table + per-field summary + CSV/XLSX/JSON export buttons

## M3 — Interoperability
- [x] XLSForm importer → Supform schema
- [x] ODK XForm importer (XML: binds, itext, select/group/repeat/upload, XPath logic)
- [x] CSV / XLSX / JSON exporters (synchronous endpoint + async Celery job flow)

## M4 — Collection at scale
- [x] Public form links, access control, response limits (requireLogin, closeDate,
      maxResponses, single-response; share link + closed/sign-in gates in the renderer)
- [ ] Offline / PWA collection
- [ ] Webhooks & integrations
- [ ] File/media attachments via S3

## M5 — Polish
- [ ] i18n / multi-language forms
- [ ] Templates gallery
- [ ] Collaboration & sharing
- [ ] Analytics dashboards

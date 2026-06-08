# CLAUDE.md

Guidance for AI assistants (and humans) working in this repo.

## What this is

Supform — an open-source form/survey platform. As easy as MS Forms, more flexible than
KoboToolbox, drivable from code. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) first.

## The one rule that matters

**The Form Schema is the contract.** It is defined in four places that MUST stay in sync:

1. `packages/form-schema/schema/form.schema.json` — canonical JSON Schema
2. `backend/app/schemas/form_schema.py` — Pydantic models
3. `frontend/src/types/form-schema.ts` — TypeScript types
4. `sdk/python/supform_sdk/fields.py` — code-first builders

If you change the shape of a form, change all four (and update `docs/form-schema.md`).

## Monorepo map

| Path | Stack | Run |
|---|---|---|
| `backend/` | FastAPI + SQLAlchemy + Pydantic | `uvicorn app.main:app --reload` |
| `frontend/` | React + TS + Vite | `npm run dev` |
| `sdk/python/` | Pure Python (+httpx) | `pip install -e .` |
| `packages/form-schema/` | JSON Schema | — |

## Where the logic lives

- Form behavior (validation, expressions, submission checks): `backend/app/form_engine/`
- Publish/versioning: `backend/app/services/forms.py`
- ODK/XLSForm import: `backend/app/importers/` (stubbed, M3)
- Exports: `backend/app/exporters/`

## Testing

- `cd backend && pytest`  — form engine + (M1) API tests
- `cd sdk/python && pytest`
- `cd frontend && npm test`

## Conventions

- Backend: async-first, `ruff` format/lint, line length 100, type hints required.
- Frontend: functional components + hooks, Zustand for state, no `any` without reason.
- Keep modules small; business logic in `services/`, not in routers.
- See [`ROADMAP.md`](./ROADMAP.md) for milestones — much is intentionally stubbed with
  clear contracts and `TODO(Mx)` markers.

# Contributing to Supform

Thanks for helping build Supform! This guide covers the basics.

## Repo layout

This is a monorepo. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the map. The most
important rule: **the Form Schema in `packages/form-schema/` is the contract.** If you
change the shape of a form, update the schema, the backend Pydantic models, the frontend
TypeScript types, and the SDK together.

## Dev environment

```bash
cp .env.example .env
docker compose up --build      # everything
# or per package:
make backend                   # FastAPI dev server
make frontend                  # Vite dev server
```

## Conventions

- **Python**: formatted with `ruff format`, linted with `ruff`, typed with `mypy`.
  Line length 100. Async-first. Tests with `pytest`.
- **TypeScript**: `biome`/`eslint` + `prettier`. Functional React components, hooks,
  Zustand for state. No `any` without a `// reason:` comment.
- **Commits**: conventional commits (`feat:`, `fix:`, `docs:`, `refactor:` …).
- **Branches**: feature branches off `main`; PRs require green CI.

## Tests

- Backend: `cd backend && pytest`
- Frontend: `cd frontend && npm test`

## Before you open a PR

- [ ] Code formatted & linted
- [ ] Tests added/updated and passing
- [ ] Schema/types/SDK kept in sync if the form model changed
- [ ] Docs updated if behavior changed

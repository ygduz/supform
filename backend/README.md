# Supform Backend

FastAPI + SQLAlchemy (async) + Pydantic. This service owns the form model, validates
submissions, and exposes the REST API.

## Layout

```
app/
  main.py            FastAPI app factory (create_app) + router wiring
  core/              config (pydantic-settings), security (JWT), logging, errors
  db/                async engine, session dependency, declarative Base
  models/            SQLAlchemy ORM models
  schemas/           Pydantic models — API I/O AND the Form Schema models
  api/v1/            versioned routers (auth, projects, forms, submissions, exports)
  form_engine/       schema validation, expression evaluation, submission validation
  importers/         XLSForm / ODK XForm  ->  Supform schema
  exporters/         submissions -> csv / xlsx / json
  services/          business logic between API and models
  workers/           Celery app + async tasks
  utils/
tests/
```

## Run

```bash
pip install -e ".[dev]"
cp ../.env.example ../.env
alembic upgrade head
uvicorn app.main:app --reload
# OpenAPI docs at http://localhost:8000/docs
```

## Key idea

The Pydantic models in `app/schemas/form_schema.py` are the Python mirror of
`packages/form-schema/schema/form.schema.json`. The `form_engine` uses them to validate
both the form definitions and the submissions made against them.

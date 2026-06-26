#!/usr/bin/env bash
# Container entrypoint: apply pending DB migrations, then start the API server.
# Running migrations on boot keeps the schema in sync on platforms (Railway, Render,
# Fly) where there's no separate release phase.
set -e

echo "Running database migrations…"
alembic upgrade head

echo "Starting API server…"
exec uvicorn app.main:app --host 0.0.0.0 --port "${SUPFORM_API_PORT:-8000}"

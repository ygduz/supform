"""FastAPI application factory.

Run with: ``uvicorn app.main:app --reload``
"""

from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.openrosa import router as openrosa_router
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import install_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.db.session import get_db


def _init_sentry() -> None:
    """Wire up error tracking if configured. A no-op unless SUPFORM_SENTRY_DSN is set and
    the optional ``sentry-sdk`` is installed (``pip install '.[monitoring]'``)."""
    if not settings.sentry_dsn:
        return
    try:
        import sentry_sdk
    except ImportError:
        get_logger("main").warning("SENTRY_DSN set but sentry-sdk not installed; skipping.")
        return
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.env,
        traces_sample_rate=settings.sentry_traces_sample_rate,
    )


async def _check_redis() -> str:
    """Best-effort Redis ping; never raises (Redis only powers async jobs, not reads)."""
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(
            settings.redis_url, socket_connect_timeout=0.5, socket_timeout=0.5
        )
        try:
            await client.ping()
            return "ok"
        finally:
            await client.aclose()
    except Exception:  # noqa: BLE001 - health probes report status, never crash
        return "error"


def create_app() -> FastAPI:
    configure_logging()
    _init_sentry()
    app = FastAPI(
        title="Supform API",
        version="0.1.0",
        description="Open-source form & survey platform — JSON-schema-first, ODK-compatible.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex or None,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],  # let the SPA read export download filenames
    )

    install_exception_handlers(app)
    app.include_router(api_router)
    app.include_router(openrosa_router)

    @app.get("/health", tags=["meta"])
    async def health(db: AsyncSession = Depends(get_db)) -> JSONResponse:
        """Liveness/readiness probe. Unhealthy (503) only when the database is unreachable;
        a down Redis is reported as degraded but still serves reads."""
        checks: dict[str, str] = {}
        try:
            await db.execute(text("SELECT 1"))
            checks["database"] = "ok"
        except Exception:  # noqa: BLE001
            checks["database"] = "error"
        checks["redis"] = await _check_redis()

        healthy = checks["database"] == "ok"
        status = (
            "ok"
            if all(v == "ok" for v in checks.values())
            else ("degraded" if healthy else "unhealthy")
        )
        return JSONResponse(
            status_code=200 if healthy else 503,
            content={"status": status, "env": settings.env, "checks": checks},
        )

    return app


app = create_app()

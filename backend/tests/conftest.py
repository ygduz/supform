"""Shared pytest fixtures.

The form-engine tests are pure and need no database. DB-backed API tests use an
in-memory SQLite (aiosqlite) engine via the ``client`` fixture below.
"""

import httpx
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core import ratelimit
from app.core.config import settings
from app.core.email import MemoryEmailSender
from app.db.base import Base
from app.db.session import get_db
from app.main import app


@pytest.fixture(autouse=True)
def _test_runtime_env():
    """Tame runtime services for the suite: rate limiting off, email captured in memory.

    The suite hammers auth/submit endpoints (so the limiter is off unless a test opts back
    in via monkeypatch), and signup now sends a verification email (captured in an
    in-process outbox tests can assert against). Both are reset around every test.
    """
    ratelimit.reset()
    MemoryEmailSender.clear()
    prev_rl, prev_email = settings.rate_limit_enabled, settings.email_backend
    settings.rate_limit_enabled = False
    settings.email_backend = "memory"
    yield
    settings.rate_limit_enabled = prev_rl
    settings.email_backend = prev_email
    ratelimit.reset()
    MemoryEmailSender.clear()


@pytest_asyncio.fixture
async def client():
    """An httpx client wired to the ASGI app over a fresh in-memory SQLite database.

    Uses ASGITransport (no network/server) and overrides the DB dependency with a shared
    in-memory engine. The portable JSONType maps to JSON on SQLite, so the same
    models run here as on Postgres.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.fixture
def contact_form_dict() -> dict:
    return {
        "name": "contact",
        "title": "Contact",
        "pages": [
            {
                "name": "p1",
                "elements": [
                    {"type": "text", "name": "full_name", "required": True},
                ],
            }
        ],
    }

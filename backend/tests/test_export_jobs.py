"""Async export-job lifecycle: enqueue -> run (worker) -> poll -> download.

The broker dispatch is stubbed so no Celery/Redis is needed; the worker's unit of work
(``run_export_job``) is invoked directly against the same in-memory DB the API uses.
"""

from __future__ import annotations

import httpx
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services import exports as exports_service


@pytest_asyncio.fixture
async def ctx(tmp_path, monkeypatch):
    """Yield (client, session_factory) over a shared in-memory SQLite, broker stubbed."""
    from app.core import config

    monkeypatch.setattr(config.settings, "storage_local_path", str(tmp_path))
    # Don't hit a real broker; the test drives the worker step itself.
    monkeypatch.setattr(exports_service, "dispatch_export", lambda job_id: None)

    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
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
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, session_factory
    app.dependency_overrides.clear()
    await engine.dispose()


async def _published_form_with_submission(client: httpx.AsyncClient, headers: dict) -> str:
    proj = await client.post("/api/v1/projects", json={"name": "P"}, headers=headers)
    content = {
        "name": "poll",
        "title": "Poll",
        "pages": [{"name": "p1", "elements": [{"type": "text", "name": "q1", "label": "Q"}]}],
    }
    form = await client.post(
        "/api/v1/forms",
        json={"project_id": proj.json()["id"], "content": content},
        headers=headers,
    )
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    await client.post(f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "hello"}})
    return form_id


async def _auth(client: httpx.AsyncClient) -> dict:
    await client.post("/api/v1/auth/signup", json={"email": "x@b.c", "password": "supersecret"})
    r = await client.post("/api/v1/auth/login", json={"email": "x@b.c", "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_export_job_full_lifecycle(ctx):
    client, session_factory = ctx
    headers = await _auth(client)
    form_id = await _published_form_with_submission(client, headers)

    # Enqueue: returns a pending job.
    enq = await client.post(f"/api/v1/forms/{form_id}/exports?format=csv", headers=headers)
    assert enq.status_code == 202
    job_id = enq.json()["id"]
    assert enq.json()["status"] == "pending"

    # Run the worker's unit of work against the same DB.
    import uuid

    async with session_factory() as session:
        await exports_service.run_export_job(session, uuid.UUID(job_id))
        await session.commit()

    # Poll: the job is done and advertises a download URL.
    status = await client.get(f"/api/v1/exports/{job_id}", headers=headers)
    assert status.status_code == 200
    body = status.json()
    assert body["status"] == "done"
    assert body["download_url"] == f"/api/v1/exports/{job_id}/download"

    # Download: the stored CSV contains the submission.
    dl = await client.get(f"/api/v1/exports/{job_id}/download", headers=headers)
    assert dl.status_code == 200
    text = dl.content.decode()
    assert "q1" in text and "hello" in text


@pytest.mark.asyncio
async def test_export_job_owner_only(ctx):
    client, _ = ctx
    headers = await _auth(client)
    form_id = await _published_form_with_submission(client, headers)
    enq = await client.post(f"/api/v1/forms/{form_id}/exports?format=csv", headers=headers)
    job_id = enq.json()["id"]

    await client.post(
        "/api/v1/auth/signup", json={"email": "other@b.c", "password": "supersecret"}
    )
    other = await client.post(
        "/api/v1/auth/login", json={"email": "other@b.c", "password": "supersecret"}
    )
    attacker = {"Authorization": f"Bearer {other.json()['access_token']}"}
    assert (await client.get(f"/api/v1/exports/{job_id}", headers=attacker)).status_code == 404

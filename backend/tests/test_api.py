"""DB-backed API tests — exercise the full loop against an in-memory SQLite database.

Uses httpx ASGITransport (no network/server needed) and overrides the DB dependency with
a shared in-memory SQLite engine. The portable JSONType maps to JSON on SQLite, so the
same models/migrations-shape run here as on Postgres.
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


@pytest_asyncio.fixture
async def client():
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


def _form_payload(project_id: str) -> dict:
    return {
        "project_id": project_id,
        "content": {
            "name": "household_survey",
            "title": "Household survey",
            "pages": [
                {
                    "name": "p1",
                    "elements": [
                        {"type": "single_choice", "name": "region", "label": "Region",
                         "required": True, "options": [{"value": "north"}, {"value": "south"}]},
                        {"type": "integer", "name": "age", "label": "Age",
                         "required": True, "validation": {"min": 0, "max": 120}},
                        {"type": "single_choice", "name": "is_head", "label": "Head?",
                         "options": [{"value": "yes"}, {"value": "no"}], "visibleIf": "age >= 18"},
                    ],
                }
            ],
        },
    }


async def _auth_headers(client: httpx.AsyncClient) -> dict:
    await client.post("/api/v1/auth/signup", json={"email": "a@b.c", "password": "supersecret"})
    r = await client.post("/api/v1/auth/login", json={"email": "a@b.c", "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_full_loop(client: httpx.AsyncClient):
    headers = await _auth_headers(client)

    proj = await client.post("/api/v1/projects", json={"name": "Research"}, headers=headers)
    assert proj.status_code == 201
    project_id = proj.json()["id"]

    created = await client.post("/api/v1/forms", json=_form_payload(project_id), headers=headers)
    assert created.status_code == 201
    form_id = created.json()["id"]

    pub = await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    assert pub.status_code == 200
    assert pub.json()["version"] == 1

    schema = await client.get(f"/api/v1/forms/{form_id}/schema")
    assert schema.status_code == 200 and schema.json()["version"] == 1

    # Valid submission: age < 18 hides is_head -> dropped from stored answers.
    ok = await client.post(f"/api/v1/forms/{form_id}/submissions",
                           json={"answers": {"region": "north", "age": 15}})
    assert ok.status_code == 201
    assert "is_head" not in ok.json()["answers"]

    listed = await client.get(f"/api/v1/forms/{form_id}/submissions", headers=headers)
    assert listed.status_code == 200 and len(listed.json()) == 1


@pytest.mark.asyncio
async def test_invalid_submission_rejected(client: httpx.AsyncClient):
    headers = await _auth_headers(client)
    project_id = (await client.post("/api/v1/projects", json={"name": "R"}, headers=headers)).json()["id"]
    form_id = (await client.post("/api/v1/forms", json=_form_payload(project_id), headers=headers)).json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)

    bad = await client.post(f"/api/v1/forms/{form_id}/submissions", json={"answers": {"age": 999}})
    assert bad.status_code == 422
    details = bad.json()["error"]["details"]
    assert "age" in details and "region" in details


@pytest.mark.asyncio
async def test_auth_required_for_listing(client: httpx.AsyncClient):
    r = await client.get("/api/v1/forms/00000000-0000-0000-0000-000000000000/submissions")
    assert r.status_code == 401

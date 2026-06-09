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
                        {
                            "type": "single_choice",
                            "name": "region",
                            "label": "Region",
                            "required": True,
                            "options": [{"value": "north"}, {"value": "south"}],
                        },
                        {
                            "type": "integer",
                            "name": "age",
                            "label": "Age",
                            "required": True,
                            "validation": {"min": 0, "max": 120},
                        },
                        {
                            "type": "single_choice",
                            "name": "is_head",
                            "label": "Head?",
                            "options": [{"value": "yes"}, {"value": "no"}],
                            "visibleIf": "age >= 18",
                        },
                    ],
                }
            ],
        },
    }


async def _headers_for(client: httpx.AsyncClient, email: str = "a@b.c") -> dict:
    await client.post("/api/v1/auth/signup", json={"email": email, "password": "supersecret"})
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _auth_headers(client: httpx.AsyncClient) -> dict:
    return await _headers_for(client)


async def _published_form(client: httpx.AsyncClient, headers: dict) -> str:
    """Create a project + form and publish it; return the form id."""
    proj = await client.post("/api/v1/projects", json={"name": "R"}, headers=headers)
    form = await client.post(
        "/api/v1/forms", json=_form_payload(proj.json()["id"]), headers=headers
    )
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    return form_id


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
    ok = await client.post(
        f"/api/v1/forms/{form_id}/submissions", json={"answers": {"region": "north", "age": 15}}
    )
    assert ok.status_code == 201
    assert "is_head" not in ok.json()["answers"]

    listed = await client.get(f"/api/v1/forms/{form_id}/submissions", headers=headers)
    assert listed.status_code == 200 and len(listed.json()) == 1


@pytest.mark.asyncio
async def test_invalid_submission_rejected(client: httpx.AsyncClient):
    headers = await _auth_headers(client)
    form_id = await _published_form(client, headers)

    bad = await client.post(f"/api/v1/forms/{form_id}/submissions", json={"answers": {"age": 999}})
    assert bad.status_code == 422
    details = bad.json()["error"]["details"]
    assert "age" in details and "region" in details


@pytest.mark.asyncio
async def test_auth_required_for_listing(client: httpx.AsyncClient):
    r = await client.get("/api/v1/forms/00000000-0000-0000-0000-000000000000/submissions")
    assert r.status_code == 401


async def _publish_form_with_settings(
    client: httpx.AsyncClient, headers: dict, settings: dict
) -> str:
    """Create + publish a single-field form carrying the given collection settings."""
    proj = await client.post("/api/v1/projects", json={"name": "S"}, headers=headers)
    content = {
        "name": "poll",
        "title": "Poll",
        "settings": settings,
        "pages": [{"name": "p1", "elements": [{"type": "text", "name": "q1", "label": "Q"}]}],
    }
    form = await client.post(
        "/api/v1/forms",
        json={"project_id": proj.json()["id"], "content": content},
        headers=headers,
    )
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    return form_id


@pytest.mark.asyncio
async def test_require_login_blocks_anonymous_submission(client: httpx.AsyncClient):
    owner = await _headers_for(client, "poll-owner@b.c")
    form_id = await _publish_form_with_settings(client, owner, {"requireLogin": True})

    anon = await client.post(f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "x"}})
    assert anon.status_code == 401

    signed_in = await client.post(
        f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "x"}}, headers=owner
    )
    assert signed_in.status_code == 201


@pytest.mark.asyncio
async def test_closed_form_rejects_submission(client: httpx.AsyncClient):
    owner = await _headers_for(client, "closed-owner@b.c")
    form_id = await _publish_form_with_settings(
        client, owner, {"closeDate": "2000-01-01T00:00:00Z"}
    )
    r = await client.post(f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "x"}})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_response_limit_enforced(client: httpx.AsyncClient):
    owner = await _headers_for(client, "limit-owner@b.c")
    form_id = await _publish_form_with_settings(client, owner, {"maxResponses": 1})

    first = await client.post(f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "a"}})
    assert first.status_code == 201
    second = await client.post(
        f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "b"}}
    )
    assert second.status_code == 403


@pytest.mark.asyncio
async def test_refresh_token_exchanges_for_new_access(client: httpx.AsyncClient):
    await client.post("/api/v1/auth/signup", json={"email": "r@b.c", "password": "supersecret"})
    login = await client.post(
        "/api/v1/auth/login", json={"email": "r@b.c", "password": "supersecret"}
    )
    refresh_token = login.json()["refresh_token"]

    ok = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert ok.status_code == 200
    assert ok.json()["access_token"]

    # An access token may not be used where a refresh token is expected.
    bad = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": login.json()["access_token"]}
    )
    assert bad.status_code == 401


@pytest.mark.asyncio
async def test_other_user_cannot_touch_your_form(client: httpx.AsyncClient):
    """A logged-in user must not read, modify, publish, list, or export someone else's form."""
    owner = await _headers_for(client, "owner@b.c")
    form_id = await _published_form(client, owner)

    # A respondent submits so there is data to (try to) exfiltrate.
    await client.post(
        f"/api/v1/forms/{form_id}/submissions", json={"answers": {"region": "north", "age": 15}}
    )

    attacker = await _headers_for(client, "attacker@b.c")

    # Each owner-only action returns 404 (existence is never disclosed) for the attacker.
    assert (await client.get(f"/api/v1/forms/{form_id}", headers=attacker)).status_code == 404
    assert (
        await client.get(f"/api/v1/forms/{form_id}/submissions", headers=attacker)
    ).status_code == 404
    assert (
        await client.get(f"/api/v1/forms/{form_id}/export?format=csv", headers=attacker)
    ).status_code == 404
    assert (
        await client.post(f"/api/v1/forms/{form_id}/publish", headers=attacker)
    ).status_code == 404
    upd = await client.put(
        f"/api/v1/forms/{form_id}",
        json={"content": _form_payload("x")["content"]},
        headers=attacker,
    )
    assert upd.status_code == 404

    # The owner still has full access.
    assert (await client.get(f"/api/v1/forms/{form_id}", headers=owner)).status_code == 200
    listed = await client.get(f"/api/v1/forms/{form_id}/submissions", headers=owner)
    assert listed.status_code == 200 and len(listed.json()) == 1


@pytest.mark.asyncio
async def test_cannot_create_form_in_another_users_project(client: httpx.AsyncClient):
    owner = await _headers_for(client, "owner2@b.c")
    proj = await client.post("/api/v1/projects", json={"name": "P"}, headers=owner)
    project_id = proj.json()["id"]

    attacker = await _headers_for(client, "attacker2@b.c")
    r = await client.post("/api/v1/forms", json=_form_payload(project_id), headers=attacker)
    assert r.status_code == 404

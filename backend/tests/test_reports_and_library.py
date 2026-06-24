"""End-to-end coverage for the saved-reports and question-library endpoints.

These surfaces had no tests, which is how a migration that dropped their tables shipped
unnoticed — against a database missing ``reports`` / ``question_templates`` every call here
500s. Exercising the full CRUD loop keeps that regression caught at the API boundary, in
addition to the static guard in ``test_migration_chain``.
"""

from __future__ import annotations

import httpx
import pytest


async def _auth_headers(client: httpx.AsyncClient, email: str = "rep@b.c") -> dict:
    await client.post("/api/v1/auth/signup", json={"email": email, "password": "supersecret"})
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _make_form(client: httpx.AsyncClient, headers: dict) -> str:
    proj = await client.post("/api/v1/projects", json={"name": "P"}, headers=headers)
    form = await client.post(
        "/api/v1/forms",
        json={
            "project_id": proj.json()["id"],
            "content": {
                "name": "f",
                "title": "F",
                "pages": [
                    {"name": "p1", "elements": [{"type": "text", "name": "q1", "label": "Q1"}]}
                ],
            },
        },
        headers=headers,
    )
    return form.json()["id"]


@pytest.mark.asyncio
async def test_reports_crud(client: httpx.AsyncClient):
    headers = await _auth_headers(client)
    form_id = await _make_form(client, headers)

    empty = await client.get(f"/api/v1/forms/{form_id}/reports", headers=headers)
    assert empty.status_code == 200 and empty.json() == []

    created = await client.post(
        f"/api/v1/forms/{form_id}/reports",
        json={"name": "Summary", "widgets": [{"type": "count"}]},
        headers=headers,
    )
    assert created.status_code == 201
    report_id = created.json()["id"]
    assert created.json()["name"] == "Summary"

    listed = await client.get(f"/api/v1/forms/{form_id}/reports", headers=headers)
    assert listed.status_code == 200 and len(listed.json()) == 1

    patched = await client.patch(
        f"/api/v1/forms/{form_id}/reports/{report_id}",
        json={"name": "Renamed", "widgets": []},
        headers=headers,
    )
    assert patched.status_code == 200 and patched.json()["name"] == "Renamed"

    deleted = await client.delete(f"/api/v1/forms/{form_id}/reports/{report_id}", headers=headers)
    assert deleted.status_code == 204

    gone = await client.get(f"/api/v1/forms/{form_id}/reports/{report_id}", headers=headers)
    assert gone.status_code == 404


@pytest.mark.asyncio
async def test_question_library_crud(client: httpx.AsyncClient):
    headers = await _auth_headers(client)

    empty = await client.get("/api/v1/question-library", headers=headers)
    assert empty.status_code == 200 and empty.json() == []

    created = await client.post(
        "/api/v1/question-library",
        json={"label": "Age", "element": {"type": "integer", "name": "age", "label": "Age"}},
        headers=headers,
    )
    assert created.status_code == 201
    template_id = created.json()["id"]
    assert created.json()["label"] == "Age"

    listed = await client.get("/api/v1/question-library", headers=headers)
    assert listed.status_code == 200 and len(listed.json()) == 1

    deleted = await client.delete(f"/api/v1/question-library/{template_id}", headers=headers)
    assert deleted.status_code == 204

    gone = await client.delete(f"/api/v1/question-library/{template_id}", headers=headers)
    assert gone.status_code == 404


@pytest.mark.asyncio
async def test_question_library_is_per_owner(client: httpx.AsyncClient):
    """A template created by one user must not be visible to another."""
    owner = await _auth_headers(client, "owner@b.c")
    await client.post(
        "/api/v1/question-library",
        json={"label": "Private", "element": {"type": "text", "name": "x", "label": "X"}},
        headers=owner,
    )
    other = await _auth_headers(client, "other@b.c")
    seen = await client.get("/api/v1/question-library", headers=other)
    assert seen.status_code == 200 and seen.json() == []

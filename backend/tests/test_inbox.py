"""Tests for the cross-form submission inbox.

These exercise the real query path (JOIN Form for the title, ownership scoping
through Project) against the in-memory SQLite ASGI client — the same path that
previously 500'd on a non-existent ``Form.content`` attribute.
"""

from __future__ import annotations

import httpx
import pytest

from tests.test_api import _form_payload, _headers_for


async def _publish_form(client: httpx.AsyncClient, headers: dict) -> str:
    proj = await client.post("/api/v1/projects", json={"name": "Inbox P"}, headers=headers)
    form = await client.post(
        "/api/v1/forms", json=_form_payload(proj.json()["id"]), headers=headers
    )
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    return form_id


async def _submit(client: httpx.AsyncClient, form_id: str, region: str, age: int) -> None:
    r = await client.post(
        f"/api/v1/forms/{form_id}/submissions",
        json={"answers": {"region": region, "age": age}},
    )
    assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_inbox_lists_owned_submissions_with_form_title(client: httpx.AsyncClient):
    owner = await _headers_for(client, "inbox-owner@b.c")
    form_id = await _publish_form(client, owner)
    await _submit(client, form_id, "north", 30)
    await _submit(client, form_id, "south", 40)

    r = await client.get("/api/v1/inbox", headers=owner)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 2
    # Every row carries the joined form title (the regression that previously 500'd).
    assert all(row["form_title"] == "Household survey" for row in rows)
    # Newest first.
    assert rows[0]["created_at"] >= rows[1]["created_at"]


@pytest.mark.asyncio
async def test_inbox_scoped_to_owner(client: httpx.AsyncClient):
    owner = await _headers_for(client, "inbox-a@b.c")
    other = await _headers_for(client, "inbox-b@b.c")
    form_id = await _publish_form(client, owner)
    await _submit(client, form_id, "north", 22)

    # The other user owns nothing → empty inbox, not the owner's submission.
    r = await client.get("/api/v1/inbox", headers=other)
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_inbox_mark_read_and_unread_filter(client: httpx.AsyncClient):
    owner = await _headers_for(client, "inbox-read@b.c")
    form_id = await _publish_form(client, owner)
    await _submit(client, form_id, "north", 25)

    rows = (await client.get("/api/v1/inbox", headers=owner)).json()
    assert rows[0]["read_at"] is None
    sub_id = rows[0]["id"]

    marked = await client.patch(f"/api/v1/inbox/{sub_id}/read", headers=owner)
    assert marked.status_code == 200
    assert marked.json()["read_at"] is not None

    # unread_only should now exclude it.
    unread = (await client.get("/api/v1/inbox?unread_only=true", headers=owner)).json()
    assert unread == []


@pytest.mark.asyncio
async def test_inbox_mark_read_rejects_non_owner(client: httpx.AsyncClient):
    owner = await _headers_for(client, "inbox-o@b.c")
    other = await _headers_for(client, "inbox-x@b.c")
    form_id = await _publish_form(client, owner)
    await _submit(client, form_id, "north", 33)
    sub_id = (await client.get("/api/v1/inbox", headers=owner)).json()[0]["id"]

    r = await client.patch(f"/api/v1/inbox/{sub_id}/read", headers=other)
    assert r.status_code == 404

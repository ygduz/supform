"""Project sharing & role-based access tests.

Reuses the in-memory SQLite ASGI harness from ``test_api`` and verifies the role
hierarchy: a viewer may read but not edit, an editor may edit but not manage members,
non-members get 404, and only the owner can grant/revoke access.
"""

from __future__ import annotations

import httpx
import pytest

from tests.test_api import _form_payload, _headers_for


async def _project_with_form(client: httpx.AsyncClient, headers: dict) -> tuple[str, str]:
    proj = await client.post("/api/v1/projects", json={"name": "Team"}, headers=headers)
    project_id = proj.json()["id"]
    form = await client.post("/api/v1/forms", json=_form_payload(project_id), headers=headers)
    return project_id, form.json()["id"]


async def _login(client: httpx.AsyncClient, email: str) -> dict:
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_viewer_can_read_but_not_edit(client: httpx.AsyncClient):
    owner = await _headers_for(client, "owner@team.c")
    project_id, form_id = await _project_with_form(client, owner)
    await _headers_for(client, "viewer@team.c")  # register the collaborator
    viewer = await _login(client, "viewer@team.c")

    # Before being added, the viewer can't even see the form exists.
    assert (await client.get(f"/api/v1/forms/{form_id}", headers=viewer)).status_code == 404

    add = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "viewer@team.c", "role": "viewer"},
        headers=owner,
    )
    assert add.status_code == 201 and add.json()["role"] == "viewer"

    # Now the viewer can read the form and list its submissions...
    assert (await client.get(f"/api/v1/forms/{form_id}", headers=viewer)).status_code == 200
    assert (
        await client.get(f"/api/v1/forms/{form_id}/submissions", headers=viewer)
    ).status_code == 200
    # ...and it shows up in their project list.
    listed = await client.get("/api/v1/projects", headers=viewer)
    assert any(p["id"] == project_id for p in listed.json())

    # But editing / publishing is forbidden (403 — they know it exists).
    upd = await client.put(
        f"/api/v1/forms/{form_id}",
        json={"content": _form_payload("x")["content"]},
        headers=viewer,
    )
    assert upd.status_code == 403
    assert (
        await client.post(f"/api/v1/forms/{form_id}/publish", headers=viewer)
    ).status_code == 403


@pytest.mark.asyncio
async def test_editor_can_edit_but_not_manage_members(client: httpx.AsyncClient):
    owner = await _headers_for(client, "owner2@team.c")
    project_id, form_id = await _project_with_form(client, owner)
    await _headers_for(client, "editor@team.c")

    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "editor@team.c", "role": "editor"},
        headers=owner,
    )
    editor = await _login(client, "editor@team.c")

    # Editor can update the draft and publish.
    upd = await client.put(
        f"/api/v1/forms/{form_id}",
        json={"content": _form_payload("x")["content"]},
        headers=editor,
    )
    assert upd.status_code == 200
    assert (
        await client.post(f"/api/v1/forms/{form_id}/publish", headers=editor)
    ).status_code == 200

    # Editor can list members (viewer-level) but not add them (owner-only).
    assert (
        await client.get(f"/api/v1/projects/{project_id}/members", headers=editor)
    ).status_code == 200
    forbidden = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "owner2@team.c", "role": "viewer"},
        headers=editor,
    )
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_owner_can_update_and_remove_member(client: httpx.AsyncClient):
    owner = await _headers_for(client, "owner3@team.c")
    project_id, form_id = await _project_with_form(client, owner)
    await _headers_for(client, "collab@team.c")

    added = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "collab@team.c", "role": "viewer"},
        headers=owner,
    )
    member_id = added.json()["user_id"]
    collab = await _login(client, "collab@team.c")

    # Promote viewer -> editor; they can now edit.
    promoted = await client.patch(
        f"/api/v1/projects/{project_id}/members/{member_id}",
        json={"role": "editor"},
        headers=owner,
    )
    assert promoted.status_code == 200 and promoted.json()["role"] == "editor"
    upd = await client.put(
        f"/api/v1/forms/{form_id}",
        json={"content": _form_payload("x")["content"]},
        headers=collab,
    )
    assert upd.status_code == 200

    # Remove the member; access is revoked (back to 404).
    rm = await client.delete(f"/api/v1/projects/{project_id}/members/{member_id}", headers=owner)
    assert rm.status_code == 204
    assert (await client.get(f"/api/v1/forms/{form_id}", headers=collab)).status_code == 404


@pytest.mark.asyncio
async def test_member_listing_includes_owner(client: httpx.AsyncClient):
    owner = await _headers_for(client, "owner4@team.c")
    project_id, _ = await _project_with_form(client, owner)
    await _headers_for(client, "c4@team.c")
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "c4@team.c", "role": "viewer"},
        headers=owner,
    )
    members = (await client.get(f"/api/v1/projects/{project_id}/members", headers=owner)).json()
    by_email = {m["email"]: m["role"] for m in members}
    assert by_email["owner4@team.c"] == "owner"
    assert by_email["c4@team.c"] == "viewer"


@pytest.mark.asyncio
async def test_add_unknown_email_and_invalid_role_rejected(client: httpx.AsyncClient):
    owner = await _headers_for(client, "owner5@team.c")
    project_id, _ = await _project_with_form(client, owner)

    missing = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "nobody@team.c", "role": "viewer"},
        headers=owner,
    )
    assert missing.status_code == 404

    await _headers_for(client, "c5@team.c")
    bad_role = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "c5@team.c", "role": "owner"},
        headers=owner,
    )
    assert bad_role.status_code == 422


@pytest.mark.asyncio
async def test_non_member_cannot_view_members(client: httpx.AsyncClient):
    owner = await _headers_for(client, "owner6@team.c")
    project_id, _ = await _project_with_form(client, owner)
    attacker = await _headers_for(client, "attacker6@team.c")
    r = await client.get(f"/api/v1/projects/{project_id}/members", headers=attacker)
    assert r.status_code == 404

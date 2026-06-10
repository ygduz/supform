"""Forms dashboard: the list endpoint's scoping/counts and owner-only deletion."""

from __future__ import annotations

import httpx
import pytest

from tests.test_api import _form_payload, _headers_for
from tests.test_sharing import _login


async def _published_form_with_submissions(
    client: httpx.AsyncClient, headers: dict, n_submissions: int
) -> tuple[str, str]:
    proj = await client.post("/api/v1/projects", json={"name": "Dash"}, headers=headers)
    project_id = proj.json()["id"]
    form = await client.post("/api/v1/forms", json=_form_payload(project_id), headers=headers)
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    for _ in range(n_submissions):
        await client.post(
            f"/api/v1/forms/{form_id}/submissions",
            json={"answers": {"region": "north", "age": 30, "is_head": "yes"}},
        )
    return project_id, form_id


@pytest.mark.asyncio
async def test_list_forms_shows_own_forms_with_counts(client: httpx.AsyncClient):
    owner = await _headers_for(client, "dash-owner@b.c")
    _, form_id = await _published_form_with_submissions(client, owner, 2)

    listed = await client.get("/api/v1/forms", headers=owner)
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["id"] == form_id
    assert row["response_count"] == 2
    assert row["status"] == "published"
    assert "updated_at" in row


@pytest.mark.asyncio
async def test_list_forms_includes_shared_projects_and_excludes_others(
    client: httpx.AsyncClient,
):
    owner = await _headers_for(client, "dash-owner2@b.c")
    project_id, form_id = await _published_form_with_submissions(client, owner, 1)

    # A viewer collaborator sees the shared form in their dashboard.
    await _headers_for(client, "dash-viewer@b.c")
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "dash-viewer@b.c", "role": "viewer"},
        headers=owner,
    )
    viewer = await _login(client, "dash-viewer@b.c")
    viewer_list = await client.get("/api/v1/forms", headers=viewer)
    assert [f["id"] for f in viewer_list.json()] == [form_id]

    # A stranger sees nothing.
    attacker = await _headers_for(client, "dash-attacker@b.c")
    assert (await client.get("/api/v1/forms", headers=attacker)).json() == []


@pytest.mark.asyncio
async def test_delete_form_is_owner_only_and_removes_everything(client: httpx.AsyncClient):
    owner = await _headers_for(client, "dash-owner3@b.c")
    project_id, form_id = await _published_form_with_submissions(client, owner, 1)
    # Attach a webhook so the explicit child cleanup is exercised too.
    await client.post(
        f"/api/v1/forms/{form_id}/webhooks",
        json={"url": "https://example.com/hook"},
        headers=owner,
    )

    # An editor collaborator may edit but not delete (403); a stranger gets 404.
    await _headers_for(client, "dash-editor@b.c")
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "dash-editor@b.c", "role": "editor"},
        headers=owner,
    )
    editor = await _login(client, "dash-editor@b.c")
    assert (await client.delete(f"/api/v1/forms/{form_id}", headers=editor)).status_code == 403
    attacker = await _headers_for(client, "dash-attacker3@b.c")
    assert (await client.delete(f"/api/v1/forms/{form_id}", headers=attacker)).status_code == 404

    # Owner deletes; the form is gone from reads and the dashboard alike.
    assert (await client.delete(f"/api/v1/forms/{form_id}", headers=owner)).status_code == 204
    assert (await client.get(f"/api/v1/forms/{form_id}", headers=owner)).status_code == 404
    assert (await client.get("/api/v1/forms", headers=owner)).json() == []

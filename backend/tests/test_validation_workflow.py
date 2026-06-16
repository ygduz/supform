"""Record validation / approval workflow: set status, filter, delete — with role gating."""

from __future__ import annotations

import httpx
import pytest

from tests.test_api import _form_payload, _headers_for
from tests.test_sharing import _login


async def _form_with_two_submissions(client: httpx.AsyncClient, headers: dict) -> tuple[str, list]:
    proj = await client.post("/api/v1/projects", json={"name": "QA"}, headers=headers)
    form = await client.post(
        "/api/v1/forms", json=_form_payload(proj.json()["id"]), headers=headers
    )
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    ids = []
    for age in (20, 30):
        r = await client.post(
            f"/api/v1/forms/{form_id}/submissions",
            json={"answers": {"region": "north", "age": age, "is_head": "yes"}},
        )
        ids.append(r.json()["id"])
    return form_id, ids


@pytest.mark.asyncio
async def test_set_filter_and_clear_validation_status(client: httpx.AsyncClient):
    owner = await _headers_for(client, "qa-owner@b.c")
    form_id, [s1, s2] = await _form_with_two_submissions(client, owner)

    # New submissions start unreviewed.
    listed = await client.get(f"/api/v1/forms/{form_id}/submissions", headers=owner)
    assert all(s["validation_status"] is None for s in listed.json())

    # Approve one, put the other on hold.
    a = await client.patch(
        f"/api/v1/forms/{form_id}/submissions/{s1}/validation",
        json={"status": "approved"},
        headers=owner,
    )
    assert a.status_code == 200 and a.json()["validation_status"] == "approved"
    await client.patch(
        f"/api/v1/forms/{form_id}/submissions/{s2}/validation",
        json={"status": "on_hold"},
        headers=owner,
    )

    # Filter by status.
    approved = await client.get(
        f"/api/v1/forms/{form_id}/submissions?validation_status=approved", headers=owner
    )
    assert [s["id"] for s in approved.json()] == [s1]

    # An invalid status is rejected.
    bad = await client.patch(
        f"/api/v1/forms/{form_id}/submissions/{s1}/validation",
        json={"status": "bogus"},
        headers=owner,
    )
    assert bad.status_code == 422

    # Clearing back to unreviewed works.
    cleared = await client.patch(
        f"/api/v1/forms/{form_id}/submissions/{s1}/validation",
        json={"status": None},
        headers=owner,
    )
    assert cleared.json()["validation_status"] is None


@pytest.mark.asyncio
async def test_set_workflow_step_and_auth(client: httpx.AsyncClient):
    owner = await _headers_for(client, "wf-owner@b.c")
    form_id, [s1, _s2] = await _form_with_two_submissions(client, owner)

    # New submissions have no workflow step.
    listed = await client.get(f"/api/v1/forms/{form_id}/submissions", headers=owner)
    assert all(s["workflow_step"] is None for s in listed.json())

    # Owner can move a submission to a named step.
    moved = await client.patch(
        f"/api/v1/submissions/{s1}/workflow-step",
        params={"step": "field_review"},
        headers=owner,
    )
    assert moved.status_code == 200
    assert moved.json()["workflow_step"] == "field_review"

    # The change persists.
    again = await client.get(f"/api/v1/forms/{form_id}/submissions", headers=owner)
    by_id = {s["id"]: s for s in again.json()}
    assert by_id[s1]["workflow_step"] == "field_review"

    # A non-member gets a 404 (existence is never leaked).
    attacker = await _headers_for(client, "wf-attacker@b.c")
    denied = await client.patch(
        f"/api/v1/submissions/{s1}/workflow-step",
        params={"step": "sneaky"},
        headers=attacker,
    )
    assert denied.status_code == 404

    # Unknown submission id → 404.
    missing = await client.patch(
        "/api/v1/submissions/00000000-0000-0000-0000-000000000000/workflow-step",
        params={"step": "x"},
        headers=owner,
    )
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_validation_and_delete_require_editor(client: httpx.AsyncClient):
    owner = await _headers_for(client, "qa-owner2@b.c")
    proj = await client.post("/api/v1/projects", json={"name": "QA"}, headers=owner)
    project_id = proj.json()["id"]
    form = await client.post("/api/v1/forms", json=_form_payload(project_id), headers=owner)
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=owner)
    sub = await client.post(
        f"/api/v1/forms/{form_id}/submissions",
        json={"answers": {"region": "north", "age": 20, "is_head": "yes"}},
    )
    sid = sub.json()["id"]

    # Viewer can read but not validate or delete (403).
    await _headers_for(client, "qa-viewer@b.c")
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "qa-viewer@b.c", "role": "viewer"},
        headers=owner,
    )
    viewer = await _login(client, "qa-viewer@b.c")
    assert (
        await client.patch(
            f"/api/v1/forms/{form_id}/submissions/{sid}/validation",
            json={"status": "approved"},
            headers=viewer,
        )
    ).status_code == 403
    assert (
        await client.delete(f"/api/v1/forms/{form_id}/submissions/{sid}", headers=viewer)
    ).status_code == 403

    # A non-member sees a 404 for both.
    attacker = await _headers_for(client, "qa-attacker@b.c")
    assert (
        await client.delete(f"/api/v1/forms/{form_id}/submissions/{sid}", headers=attacker)
    ).status_code == 404

    # Owner can delete.
    assert (
        await client.delete(f"/api/v1/forms/{form_id}/submissions/{sid}", headers=owner)
    ).status_code == 204
    remaining = await client.get(f"/api/v1/forms/{form_id}/submissions", headers=owner)
    assert remaining.json() == []

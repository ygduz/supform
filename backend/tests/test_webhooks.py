"""Webhook CRUD, authorization, signing, and submission-event dispatch."""

from __future__ import annotations

import httpx
import pytest

from app.services import webhooks as webhooks_service
from tests.test_api import _form_payload, _headers_for


async def _form(client: httpx.AsyncClient, headers: dict) -> str:
    proj = await client.post("/api/v1/projects", json={"name": "Hooks"}, headers=headers)
    form = await client.post(
        "/api/v1/forms", json=_form_payload(proj.json()["id"]), headers=headers
    )
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    return form_id


@pytest.mark.asyncio
async def test_webhook_crud_and_auth(client: httpx.AsyncClient):
    owner = await _headers_for(client, "wh-owner@b.c")
    form_id = await _form(client, owner)

    # Create
    created = await client.post(
        f"/api/v1/forms/{form_id}/webhooks",
        json={"url": "https://example.com/hook"},
        headers=owner,
    )
    assert created.status_code == 201
    body = created.json()
    assert body["url"] == "https://example.com/hook"
    assert body["active"] is True
    assert body["secret"]  # a signing secret was generated
    webhook_id = body["id"]

    # List
    listed = await client.get(f"/api/v1/forms/{form_id}/webhooks", headers=owner)
    assert listed.status_code == 200 and len(listed.json()) == 1

    # Toggle off
    patched = await client.patch(
        f"/api/v1/forms/{form_id}/webhooks/{webhook_id}",
        json={"active": False},
        headers=owner,
    )
    assert patched.status_code == 200 and patched.json()["active"] is False

    # A bad URL is rejected
    bad = await client.post(
        f"/api/v1/forms/{form_id}/webhooks", json={"url": "ftp://nope"}, headers=owner
    )
    assert bad.status_code == 422

    # Delete
    deleted = await client.delete(f"/api/v1/forms/{form_id}/webhooks/{webhook_id}", headers=owner)
    assert deleted.status_code == 204
    assert (await client.get(f"/api/v1/forms/{form_id}/webhooks", headers=owner)).json() == []


@pytest.mark.asyncio
async def test_webhook_management_requires_editor(client: httpx.AsyncClient):
    owner = await _headers_for(client, "wh-owner2@b.c")
    proj = await client.post("/api/v1/projects", json={"name": "Hooks"}, headers=owner)
    project_id = proj.json()["id"]
    form = await client.post("/api/v1/forms", json=_form_payload(project_id), headers=owner)
    form_id = form.json()["id"]

    # A viewer collaborator can't manage webhooks (403).
    await _headers_for(client, "wh-viewer@b.c")
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "wh-viewer@b.c", "role": "viewer"},
        headers=owner,
    )
    viewer = await _login(client, "wh-viewer@b.c")
    forbidden = await client.post(
        f"/api/v1/forms/{form_id}/webhooks",
        json={"url": "https://example.com/hook"},
        headers=viewer,
    )
    assert forbidden.status_code == 403

    # A non-member can't even see it exists (404).
    attacker = await _headers_for(client, "wh-attacker@b.c")
    assert (
        await client.get(f"/api/v1/forms/{form_id}/webhooks", headers=attacker)
    ).status_code == 404


@pytest.mark.asyncio
async def test_submission_dispatches_active_webhooks(client: httpx.AsyncClient, monkeypatch):
    owner = await _headers_for(client, "wh-owner3@b.c")
    form_id = await _form(client, owner)

    # One active and one disabled webhook — only the active one should fire.
    await client.post(
        f"/api/v1/forms/{form_id}/webhooks",
        json={"url": "https://example.com/active"},
        headers=owner,
    )
    off = await client.post(
        f"/api/v1/forms/{form_id}/webhooks",
        json={"url": "https://example.com/off"},
        headers=owner,
    )
    await client.patch(
        f"/api/v1/forms/{form_id}/webhooks/{off.json()['id']}",
        json={"active": False},
        headers=owner,
    )

    calls: list[tuple] = []
    monkeypatch.setattr(webhooks_service, "enqueue_delivery", lambda *a, **k: calls.append(a))

    r = await client.post(
        f"/api/v1/forms/{form_id}/submissions",
        json={"answers": {"region": "north", "age": 20, "is_head": "yes"}},
    )
    assert r.status_code == 201

    assert len(calls) == 1
    _id, url, _secret, payload = calls[0]
    assert url == "https://example.com/active"
    assert payload["event"] == "submission.created"
    assert payload["submission"]["answers"]["region"] == "north"


def test_signature_is_stable_hmac():
    body = b'{"hello":"world"}'
    sig = webhooks_service.sign("topsecret", body)
    # Deterministic and verifiable with the same secret; differs for a wrong secret.
    assert sig == webhooks_service.sign("topsecret", body)
    assert sig != webhooks_service.sign("other", body)


def test_deliver_signs_and_posts(monkeypatch):
    captured = {}

    class _Resp:
        status_code = 200

        def raise_for_status(self):
            return None

    def fake_post(url, content, headers, timeout):
        captured["url"] = url
        captured["content"] = content
        captured["headers"] = headers
        return _Resp()

    import httpx as _httpx

    monkeypatch.setattr(_httpx, "post", fake_post)

    payload = {"event": "submission.created", "submission": {"id": "1"}}
    status = webhooks_service.deliver("https://example.com/hook", "sek", payload)
    assert status == 200
    assert captured["url"] == "https://example.com/hook"
    expected = webhooks_service.sign("sek", captured["content"])
    assert captured["headers"][webhooks_service.SIGNATURE_HEADER] == expected


async def _login(client: httpx.AsyncClient, email: str) -> dict:
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

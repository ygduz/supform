"""Email response notifications: dispatched on submit when notifyEmails is set."""

from __future__ import annotations

import httpx
import pytest

from app.services import notifications as notifications_service
from tests.test_api import _form_payload, _headers_for


async def _publish_with_settings(client: httpx.AsyncClient, headers: dict, settings: dict) -> str:
    proj = await client.post("/api/v1/projects", json={"name": "N"}, headers=headers)
    content = _form_payload(proj.json()["id"])["content"]
    content["settings"] = settings
    form = await client.post(
        "/api/v1/forms", json={"project_id": proj.json()["id"], "content": content}, headers=headers
    )
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    return form_id


@pytest.mark.asyncio
async def test_submission_notifies_configured_emails(client: httpx.AsyncClient, monkeypatch):
    owner = await _headers_for(client, "notify-owner@b.c")
    form_id = await _publish_with_settings(
        client, owner, {"notifyEmails": ["a@team.c", "b@team.c"]}
    )

    calls: list[tuple] = []
    monkeypatch.setattr(notifications_service, "enqueue_notification", lambda *a: calls.append(a))

    r = await client.post(
        f"/api/v1/forms/{form_id}/submissions",
        json={"answers": {"region": "north", "age": 22, "is_head": "yes"}},
    )
    assert r.status_code == 201
    assert len(calls) == 1
    emails, subject, _body = calls[0]
    assert emails == ["a@team.c", "b@team.c"]
    assert "New response" in subject


@pytest.mark.asyncio
async def test_no_notification_when_unset(client: httpx.AsyncClient, monkeypatch):
    owner = await _headers_for(client, "notify-owner2@b.c")
    form_id = await _publish_with_settings(client, owner, {})

    calls: list[tuple] = []
    monkeypatch.setattr(notifications_service, "enqueue_notification", lambda *a: calls.append(a))

    await client.post(
        f"/api/v1/forms/{form_id}/submissions",
        json={"answers": {"region": "north", "age": 22, "is_head": "yes"}},
    )
    assert calls == []

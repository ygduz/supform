"""AI form generation: unconfigured guard, happy path, and self-correction retry.

The Anthropic call is mocked, so no network or API key is needed.
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.core.config import settings
from app.services import ai as ai_service

_GOOD = {
    "schemaVersion": "1.0",
    "name": "feedback",
    "title": "Feedback",
    "pages": [{"name": "p1", "elements": [{"type": "text", "name": "q1", "label": "Q1"}]}],
}


def _anthropic_text(payload: dict) -> dict:
    return {"content": [{"type": "text", "text": json.dumps(payload)}]}


@pytest.fixture
def ai_key(monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", "test-key")


@pytest.mark.asyncio
async def test_generate_form_unconfigured_returns_503(client: httpx.AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", "")
    headers = await _login(client, "ai1@b.c")
    r = await client.post("/api/v1/ai/generate-form", json={"prompt": "a survey"}, headers=headers)
    assert r.status_code == 503


@pytest.mark.asyncio
async def test_generate_form_happy_path(client: httpx.AsyncClient, monkeypatch, ai_key):
    async def fake_call(_messages):
        return json.dumps(_GOOD)

    monkeypatch.setattr(ai_service, "_call_api", fake_call)
    headers = await _login(client, "ai2@b.c")
    r = await client.post(
        "/api/v1/ai/generate-form", json={"prompt": "a feedback form"}, headers=headers
    )
    assert r.status_code == 200
    assert r.json()["name"] == "feedback"


@pytest.mark.asyncio
async def test_generate_form_retries_then_succeeds(monkeypatch, ai_key):
    calls = {"n": 0}

    async def fake_call(_messages):
        calls["n"] += 1
        return "not json" if calls["n"] == 1 else json.dumps(_GOOD)

    monkeypatch.setattr(ai_service, "_call_api", fake_call)
    schema = await ai_service.generate_form("make me a form")
    assert schema.name == "feedback"
    assert calls["n"] == 2  # one retry after the first invalid reply


@pytest.mark.asyncio
async def test_generate_form_gives_up_after_retry(monkeypatch, ai_key):
    async def fake_call(_messages):
        return "still not json"

    monkeypatch.setattr(ai_service, "_call_api", fake_call)
    with pytest.raises(ai_service.AIServiceError):
        await ai_service.generate_form("make me a form")


@pytest.mark.asyncio
async def test_extract_text_joins_text_parts():
    text = ai_service._extract_text(_anthropic_text(_GOOD))
    assert json.loads(text)["name"] == "feedback"


async def _login(client: httpx.AsyncClient, email: str) -> dict:
    await client.post("/api/v1/auth/signup", json={"email": email, "password": "supersecret"})
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

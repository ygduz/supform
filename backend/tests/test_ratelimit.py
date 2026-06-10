"""The per-IP rate limiter throttles abuse-prone endpoints once enabled."""

from __future__ import annotations

import httpx
import pytest

from app.core import ratelimit
from app.core.config import settings


@pytest.mark.asyncio
async def test_login_is_rate_limited(client: httpx.AsyncClient, monkeypatch):
    # The suite disables limiting by default; turn it on for this test only.
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    ratelimit.reset()

    # Login allows 10 attempts/min/IP. Failed attempts still count (the limiter runs
    # before the handler), so the 11th is throttled regardless of credentials.
    statuses = []
    for _ in range(12):
        r = await client.post(
            "/api/v1/auth/login", json={"email": "nobody@b.c", "password": "wrongpass"}
        )
        statuses.append(r.status_code)

    assert statuses[:10] == [401] * 10  # first ten reach the handler (bad creds -> 401)
    assert 429 in statuses[10:]  # subsequent ones are throttled


@pytest.mark.asyncio
async def test_signup_is_rate_limited(client: httpx.AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    ratelimit.reset()

    statuses = []
    for i in range(7):
        r = await client.post(
            "/api/v1/auth/signup", json={"email": f"u{i}@b.c", "password": "supersecret"}
        )
        statuses.append(r.status_code)

    # Signup allows 5/min/IP: the first five succeed, the rest are throttled.
    assert statuses[:5] == [201] * 5
    assert statuses[5:] == [429, 429]

"""The /health probe reports component status and the right HTTP code."""

from __future__ import annotations

import httpx
import pytest


@pytest.mark.asyncio
async def test_health_ok_when_database_reachable(client: httpx.AsyncClient):
    r = await client.get("/health")
    # The test DB (sqlite) is always reachable → healthy (200). Redis may be down in CI,
    # which is reported as "degraded" but still 200 (Redis only powers async jobs).
    assert r.status_code == 200
    body = r.json()
    assert body["checks"]["database"] == "ok"
    assert body["status"] in ("ok", "degraded")
    assert "redis" in body["checks"]

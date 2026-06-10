"""A small per-client fixed-window rate limiter.

Used to throttle abuse-prone endpoints: login/signup (credential stuffing) and the public
submission endpoint (spam). It's an in-process counter — simple, dependency-free, and a
meaningful first layer. For a multi-process / multi-host deployment, put a shared limiter
(e.g. Redis or the ingress/CDN) in front; the dependency surface here stays the same.

Disabled wholesale when ``settings.rate_limit_enabled`` is false (the test suite hammers
these endpoints and would otherwise throttle itself).
"""

from __future__ import annotations

import time
from collections import defaultdict
from collections.abc import Awaitable, Callable

from fastapi import Request

from app.core.config import settings
from app.core.exceptions import RateLimitError

# window-bucket key -> hit count. Buckets are pruned lazily as time advances.
_hits: dict[str, int] = defaultdict(int)
_current_bucket: int | None = None


def reset() -> None:
    """Clear all counters (used by tests)."""
    global _current_bucket
    _hits.clear()
    _current_bucket = None


def _client_ip(request: Request) -> str:
    """Best-effort client IP. Honors the first X-Forwarded-For hop when behind a proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check(scope: str, client: str, limit: int, window: int) -> None:
    global _current_bucket
    bucket = int(time.time()) // window
    # New window → drop the previous window's counters so memory stays bounded.
    if bucket != _current_bucket:
        _hits.clear()
        _current_bucket = bucket

    key = f"{scope}:{client}:{bucket}"
    _hits[key] += 1
    if _hits[key] > limit:
        raise RateLimitError(
            "Too many requests. Please slow down and try again shortly.",
            details={"scope": scope, "limit": limit, "window_seconds": window},
        )


def rate_limit(
    limit: int, window_seconds: int, *, scope: str
) -> Callable[[Request], Awaitable[None]]:
    """Build a FastAPI dependency that allows ``limit`` requests per ``window_seconds`` per IP."""

    async def dependency(request: Request) -> None:
        if not settings.rate_limit_enabled:
            return
        _check(scope, _client_ip(request), limit, window_seconds)

    return dependency

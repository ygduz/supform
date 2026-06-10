"""Email verification and password-reset flows."""

from __future__ import annotations

import re

import httpx
import pytest

from app.core.email import MemoryEmailSender


def _last_token() -> str:
    """Pull the token out of the most recent captured email's link."""
    assert MemoryEmailSender.outbox, "expected an email to have been sent"
    body = MemoryEmailSender.outbox[-1].body
    match = re.search(r"token=([A-Za-z0-9._-]+)", body)
    assert match, f"no token found in email body: {body!r}"
    return match.group(1)


async def _signup(client: httpx.AsyncClient, email: str) -> None:
    r = await client.post("/api/v1/auth/signup", json={"email": email, "password": "supersecret"})
    assert r.status_code == 201
    assert r.json()["is_verified"] is False  # new accounts start unverified


@pytest.mark.asyncio
async def test_signup_sends_verification_and_verify_marks_account(client: httpx.AsyncClient):
    MemoryEmailSender.clear()
    await _signup(client, "verify@b.c")
    token = _last_token()  # signup sent a verification email

    ok = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert ok.status_code == 200
    assert ok.json()["is_verified"] is True

    # A garbage token is rejected.
    bad = await client.post("/api/v1/auth/verify-email", json={"token": "not.a.token"})
    assert bad.status_code == 401


@pytest.mark.asyncio
async def test_password_reset_full_flow(client: httpx.AsyncClient):
    await _signup(client, "reset@b.c")
    MemoryEmailSender.clear()

    # Request a reset; response is generic and an email is sent.
    r = await client.post("/api/v1/auth/forgot-password", json={"email": "reset@b.c"})
    assert r.status_code == 200
    token = _last_token()

    # Use the token to set a new password.
    done = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": "brand-new-pass"}
    )
    assert done.status_code == 200

    # Old password no longer works; the new one does.
    old = await client.post(
        "/api/v1/auth/login", json={"email": "reset@b.c", "password": "supersecret"}
    )
    assert old.status_code == 401
    new = await client.post(
        "/api/v1/auth/login", json={"email": "reset@b.c", "password": "brand-new-pass"}
    )
    assert new.status_code == 200


@pytest.mark.asyncio
async def test_reset_token_is_single_use(client: httpx.AsyncClient):
    await _signup(client, "single@b.c")
    MemoryEmailSender.clear()
    await client.post("/api/v1/auth/forgot-password", json={"email": "single@b.c"})
    token = _last_token()

    first = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": "first-new-pass"}
    )
    assert first.status_code == 200

    # The same token is now bound to the old password hash and must be rejected.
    second = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": "second-new-pass"}
    )
    assert second.status_code == 401


@pytest.mark.asyncio
async def test_forgot_password_does_not_reveal_account_existence(client: httpx.AsyncClient):
    MemoryEmailSender.clear()
    r = await client.post("/api/v1/auth/forgot-password", json={"email": "ghost@b.c"})
    # Same 200 response as for a real account, but no email is actually sent.
    assert r.status_code == 200
    assert MemoryEmailSender.outbox == []


@pytest.mark.asyncio
async def test_verify_token_cannot_be_used_as_reset_token(client: httpx.AsyncClient):
    MemoryEmailSender.clear()
    await _signup(client, "crosstype@b.c")
    verify_token = _last_token()

    # A verification token must not be accepted by the reset endpoint (type is checked).
    r = await client.post(
        "/api/v1/auth/reset-password", json={"token": verify_token, "password": "whatever-pass"}
    )
    assert r.status_code == 401

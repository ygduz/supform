"""Email-verification and password-reset flows.

Both are stateless: the link a user receives carries a short-lived signed token (no extra
DB table). A reset token is additionally bound to a fingerprint of the user's current
password hash, so it stops working the moment the password changes — making it
effectively single-use and invalidating outstanding links after any reset.
"""

from __future__ import annotations

import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.email import send_email
from app.core.exceptions import AuthError
from app.core.security import create_purpose_token, decode_token, hash_password
from app.models.user import User

VERIFY_EMAIL = "verify_email"
PASSWORD_RESET = "password_reset"


def _password_fingerprint(hashed_password: str) -> str:
    """A short, non-reversible tag of the current password hash, for single-use binding."""
    return hashlib.sha256(hashed_password.encode()).hexdigest()[:16]


async def _user_by_email(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(User.email == email))


# ---- email verification ----


async def send_verification_email(user: User) -> str:
    token = create_purpose_token(
        str(user.id), VERIFY_EMAIL, expires_minutes=settings.verify_token_expire_minutes
    )
    link = f"{settings.app_base_url}/verify-email?token={token}"
    send_email(
        user.email,
        "Confirm your Supform email",
        f"Welcome to Supform! Confirm your email address by opening this link:\n\n{link}\n\n"
        f"If you didn't create an account, you can ignore this message.",
    )
    return token


async def verify_email(db: AsyncSession, token: str) -> User:
    payload = decode_token(token)
    if not payload or payload.get("type") != VERIFY_EMAIL:
        raise AuthError("Invalid or expired verification link")
    user = await db.get(User, _uuid(payload.get("sub")))
    if user is None:
        raise AuthError("Invalid or expired verification link")
    user.is_verified = True
    await db.flush()
    return user


# ---- password reset ----


async def request_password_reset(db: AsyncSession, email: str) -> str | None:
    """Send a reset link if the email exists. Returns the token (for tests/logging) or None.

    The caller must always respond identically regardless of the return value, so the
    endpoint never reveals whether an email is registered.
    """
    user = await _user_by_email(db, email)
    if user is None:
        return None
    token = create_purpose_token(
        str(user.id),
        PASSWORD_RESET,
        expires_minutes=settings.reset_token_expire_minutes,
        extra={"pf": _password_fingerprint(user.hashed_password)},
    )
    link = f"{settings.app_base_url}/reset-password?token={token}"
    send_email(
        user.email,
        "Reset your Supform password",
        f"We received a request to reset your password. Open this link to choose a new one:"
        f"\n\n{link}\n\nThis link expires in "
        f"{settings.reset_token_expire_minutes} minutes. If you didn't ask for this, ignore "
        f"this email — your password won't change.",
    )
    return token


async def reset_password(db: AsyncSession, token: str, new_password: str) -> User:
    payload = decode_token(token)
    if not payload or payload.get("type") != PASSWORD_RESET:
        raise AuthError("Invalid or expired reset link")
    user = await db.get(User, _uuid(payload.get("sub")))
    if user is None:
        raise AuthError("Invalid or expired reset link")
    # Single-use: the token is bound to the password it was issued against.
    if payload.get("pf") != _password_fingerprint(user.hashed_password):
        raise AuthError("This reset link has already been used or is no longer valid")
    user.hashed_password = hash_password(new_password)
    await db.flush()
    return user


def _uuid(value: object):
    import uuid

    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None

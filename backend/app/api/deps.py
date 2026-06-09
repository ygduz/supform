"""Shared FastAPI dependencies (auth, current user)."""

from __future__ import annotations

import uuid

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthError
from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise AuthError("Not authenticated")
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise AuthError("Invalid or expired token")
    user = await db.get(User, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise AuthError("User not found or inactive")
    return user


async def get_optional_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Like :func:`get_current_user` but returns ``None`` instead of raising.

    Used by public endpoints (e.g. form submission) that behave differently for a
    signed-in respondent but must still accept anonymous traffic.
    """
    if not token:
        return None
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    user = await db.get(User, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        return None
    return user

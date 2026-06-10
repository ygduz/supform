"""Authentication endpoints: signup, login, refresh."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthError
from app.core.ratelimit import rate_limit
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.api import (
    EmailRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenPair,
    TokenRequest,
    UserOut,
)
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

# Credential endpoints are throttled per IP to blunt brute-force / credential stuffing.
_login_throttle = rate_limit(10, 60, scope="auth-login")
_signup_throttle = rate_limit(5, 60, scope="auth-signup")
_email_throttle = rate_limit(5, 60, scope="auth-email")  # verify/reset link requests


@router.post(
    "/signup", response_model=UserOut, status_code=201, dependencies=[Depends(_signup_throttle)]
)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)) -> User:
    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise AuthError("Email already registered")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    await db.flush()
    await auth_service.send_verification_email(user)
    return user


@router.post("/login", response_model=TokenPair, dependencies=[Depends(_login_throttle)])
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise AuthError("Incorrect email or password")
    sub = str(user.id)
    return TokenPair(
        access_token=create_access_token(sub),
        refresh_token=create_refresh_token(sub),
    )


@router.post("/verify-email", response_model=UserOut)
async def verify_email(payload: TokenRequest, db: AsyncSession = Depends(get_db)) -> User:
    """Confirm an email address from the link sent at signup."""
    return await auth_service.verify_email(db, payload.token)


@router.post(
    "/request-verification",
    response_model=MessageResponse,
    dependencies=[Depends(_email_throttle)],
)
async def request_verification(
    payload: EmailRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    """Resend the verification email (no-op response if the address is unknown/verified)."""
    user = await db.scalar(select(User).where(User.email == payload.email))
    if user is not None and not user.is_verified:
        await auth_service.send_verification_email(user)
    return MessageResponse(detail="If that address needs verification, a link has been sent.")


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    dependencies=[Depends(_email_throttle)],
)
async def forgot_password(
    payload: EmailRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    """Begin a password reset. Always succeeds so the response never reveals account existence."""
    await auth_service.request_password_reset(db, payload.email)
    return MessageResponse(detail="If that account exists, a password-reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    """Set a new password using a valid reset token."""
    await auth_service.reset_password(db, payload.token, payload.password)
    return MessageResponse(detail="Your password has been reset. You can now sign in.")


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    """Exchange a valid refresh token for a fresh access + refresh pair (rotation)."""
    data = decode_token(payload.refresh_token)
    if not data or data.get("type") != "refresh":
        raise AuthError("Invalid or expired refresh token")
    user = await db.get(User, uuid.UUID(data["sub"]))
    if user is None or not user.is_active:
        raise AuthError("User not found or inactive")
    sub = str(user.id)
    return TokenPair(
        access_token=create_access_token(sub),
        refresh_token=create_refresh_token(sub),
    )

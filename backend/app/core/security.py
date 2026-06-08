"""Authentication & password helpers.

Deliberately dependency-light: passwords use passlib's pure-Python ``pbkdf2_sha256`` and
JWTs are HS256 signed with the standard library (``hmac``/``hashlib``). This avoids native
crypto extensions entirely, so auth works identically in every environment (no bcrypt /
``cryptography`` build or ABI surprises). Swapping in bcrypt/RS256 later is a localized
change confined to this module.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from passlib.context import CryptContext

from app.core.config import settings

_pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


# ---- passwords ----
def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ---- JWT (HS256, stdlib) ----
def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def _sign(message: bytes) -> str:
    digest = hmac.new(settings.secret_key.encode(), message, hashlib.sha256).digest()
    return _b64url_encode(digest)


def _encode(payload: dict[str, Any]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    h = _b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    p = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{h}.{p}".encode()
    return f"{h}.{p}.{_sign(signing_input)}"


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": subject,
        "type": "access",
        "iat": now,
        "exp": now + settings.access_token_expire_minutes * 60,
    }
    if extra:
        payload.update(extra)
    return _encode(payload)


def create_refresh_token(subject: str) -> str:
    now = int(time.time())
    payload = {
        "sub": subject,
        "type": "refresh",
        "iat": now,
        "exp": now + settings.refresh_token_expire_days * 86400,
    }
    return _encode(payload)


def decode_token(token: str) -> dict[str, Any] | None:
    """Return the token payload, or ``None`` if the signature is invalid or it's expired."""
    try:
        h, p, sig = token.split(".")
    except ValueError:
        return None
    if not hmac.compare_digest(sig, _sign(f"{h}.{p}".encode())):
        return None
    try:
        payload: dict[str, Any] = json.loads(_b64url_decode(p))
    except (ValueError, json.JSONDecodeError):
        return None
    if "exp" in payload and time.time() > payload["exp"]:
        return None
    return payload

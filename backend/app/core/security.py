"""Authentication & password helpers.

Deliberately dependency-light: passwords use PBKDF2-HMAC-SHA256 from the standard library
(``hashlib.pbkdf2_hmac``, OpenSSL-accelerated) and JWTs are HS256 signed with ``hmac``/
``hashlib``. This avoids native crypto extensions entirely, so auth works identically in
every environment (no bcrypt / ``cryptography`` build or ABI surprises) and pulls in no
third-party crypto dependency. Swapping in bcrypt/RS256 later is a localized change confined
to this module.

The stored hash uses passlib's Modular Crypt Format (``$pbkdf2-sha256$rounds$salt$checksum``)
with its "ab64" alphabet, so hashes are byte-for-byte interchangeable with any earlier
passlib-issued ones — no re-hash or migration needed.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import time
from typing import Any

from app.core.config import settings

_PBKDF2_SCHEME = "pbkdf2-sha256"
_PBKDF2_ROUNDS = 29000
_PBKDF2_SALT_BYTES = 16


# ---- passwords ----
def _ab64_encode(raw: bytes) -> str:
    """passlib's "adapted base64": standard base64 with ``+``→``.`` and no padding."""
    return base64.b64encode(raw).decode("ascii").rstrip("=").replace("+", ".")


def _ab64_decode(data: str) -> bytes:
    data = data.replace(".", "+")
    data += "=" * (-len(data) % 4)
    # validate=True so a malformed (non-alphabet) field raises instead of silently
    # decoding to garbage — verify_password turns that into a clean auth failure.
    return base64.b64decode(data, validate=True)


def hash_password(plain: str) -> str:
    salt = os.urandom(_PBKDF2_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, _PBKDF2_ROUNDS)
    return f"${_PBKDF2_SCHEME}${_PBKDF2_ROUNDS}${_ab64_encode(salt)}${_ab64_encode(digest)}"


def verify_password(plain: str, hashed: str) -> bool:
    try:
        _, scheme, rounds_s, salt_s, checksum_s = hashed.split("$")
        if scheme != _PBKDF2_SCHEME:
            return False
        rounds = int(rounds_s)
        salt = _ab64_decode(salt_s)
        expected = _ab64_decode(checksum_s)
        # A corrupt row (zero rounds, empty salt/checksum) must fail auth cleanly,
        # not raise out of pbkdf2_hmac (dklen=0 / rounds<1 both ValueError).
        if rounds < 1 or not salt or not expected:
            return False
        digest = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, rounds, dklen=len(expected))
    except (ValueError, binascii.Error):
        return False
    return hmac.compare_digest(digest, expected)


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


def create_purpose_token(
    subject: str, token_type: str, *, expires_minutes: int, extra: dict[str, Any] | None = None
) -> str:
    """Short-lived signed token for one-off flows (email verification, password reset).

    ``type`` is checked on the consuming side so a token minted for one purpose can't be
    replayed against another. Callers can embed ``extra`` claims (e.g. a binding to the
    current password hash, which makes a reset token single-use)."""
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires_minutes * 60,
    }
    if extra:
        payload.update(extra)
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

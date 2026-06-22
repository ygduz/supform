"""Password hashing — round-trip, legacy passlib compatibility, and robustness.

``security.py`` was migrated off passlib to stdlib ``pbkdf2_hmac`` while keeping passlib's
``$pbkdf2-sha256$`` MCF so existing hashes verify unchanged. These tests pin both halves of
that contract and ensure a malformed/corrupt stored hash fails authentication cleanly rather
than raising (which would 500 the login endpoint).
"""

from __future__ import annotations

import pytest

from app.core.security import hash_password, verify_password

# A real hash produced by the previous passlib-based implementation for "Test1234!".
_LEGACY_PASSLIB_HASH = (
    "$pbkdf2-sha256$29000$AkBordUa4/zfGwMgxLj3vg$bUrtLwFT1qCMjXwNdDr69PyPPW2Bp.wfp34b4i7MdvM"
)


def test_round_trip():
    h = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", h)
    assert not verify_password("Correct Horse Battery Staple", h)


def test_hash_is_salted():
    """Two hashes of the same password differ (random salt)."""
    assert hash_password("same") != hash_password("same")


def test_hash_format():
    h = hash_password("x")
    assert h.startswith("$pbkdf2-sha256$29000$")
    assert h.count("$") == 4


def test_legacy_passlib_hash_still_verifies():
    assert verify_password("Test1234!", _LEGACY_PASSLIB_HASH)
    assert not verify_password("wrong", _LEGACY_PASSLIB_HASH)


@pytest.mark.parametrize(
    "bad_hash",
    [
        "",
        "plaintext-not-a-hash",
        "$pbkdf2-sha256$29000",  # too few fields
        "$bcrypt$12$abc$def",  # wrong scheme
        "$pbkdf2-sha256$abc$c2FsdA$Y2hr",  # non-integer rounds
        "$pbkdf2-sha256$0$c2FsdA$Y2hr",  # zero rounds
        "$pbkdf2-sha256$29000$$",  # empty salt + checksum
        "$pbkdf2-sha256$29000$!!!bad!!!$@@@",  # non-base64 fields
    ],
)
def test_malformed_hash_fails_cleanly(bad_hash: str):
    # Must return False, never raise — a corrupt row must not crash login.
    assert verify_password("anything", bad_hash) is False

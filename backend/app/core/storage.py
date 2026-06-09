"""Blob storage for uploaded media.

A tiny abstraction over where file bytes live. The default ``LocalStorage`` writes under
``settings.storage_local_path``; an S3 backend (M4) can implement the same three methods
without touching callers. Files are addressed by an opaque key (the media row's UUID).
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from app.core.config import settings


class Storage(Protocol):
    def save(self, key: str, data: bytes) -> None: ...
    def read(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...


class LocalStorage:
    """Store blobs as files on the local filesystem, one file per key."""

    def __init__(self, root: str) -> None:
        self._root = Path(root)
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Keys are server-generated UUIDs, so there's no user-controlled path traversal.
        return self._root / key

    def save(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)  # keys may contain a prefix dir
        path.write_bytes(data)

    def read(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


def get_storage() -> Storage:
    """Return the configured storage backend (local for now)."""
    return LocalStorage(settings.storage_local_path)

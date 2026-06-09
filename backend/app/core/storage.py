"""Blob storage for uploaded media.

A tiny abstraction over where file bytes live. ``LocalStorage`` writes under
``settings.storage_local_path``; ``S3Storage`` puts the same keys in an S3 (or
S3-compatible, e.g. MinIO) bucket. Both implement the same three methods, so callers
never change. Files are addressed by an opaque key (the media row's UUID).
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


class S3Storage:
    """Store blobs in an S3 (or S3-compatible) bucket, one object per key.

    ``boto3`` is imported lazily so it's only required when this backend is selected.
    An optional ``prefix`` namespaces objects within the bucket.
    """

    def __init__(
        self,
        bucket: str,
        *,
        prefix: str = "",
        region: str | None = None,
        endpoint_url: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
    ) -> None:
        if not bucket:
            raise ValueError("storage_backend='s3' requires SUPFORM_S3_BUCKET to be set")
        import boto3

        self._bucket = bucket
        self._prefix = prefix
        self._client = boto3.client(
            "s3",
            region_name=region,
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key or None,
            aws_secret_access_key=secret_key or None,
        )

    def _key(self, key: str) -> str:
        return f"{self._prefix}{key}"

    def save(self, key: str, data: bytes) -> None:
        self._client.put_object(Bucket=self._bucket, Key=self._key(key), Body=data)

    def read(self, key: str) -> bytes:
        obj = self._client.get_object(Bucket=self._bucket, Key=self._key(key))
        return obj["Body"].read()

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=self._key(key))


def get_storage() -> Storage:
    """Return the configured storage backend (``local`` or ``s3``)."""
    if settings.storage_backend == "s3":
        return S3Storage(
            settings.s3_bucket,
            prefix=settings.s3_prefix,
            region=settings.s3_region,
            endpoint_url=settings.s3_endpoint_url,
            access_key=settings.s3_access_key_id,
            secret_key=settings.s3_secret_access_key,
        )
    return LocalStorage(settings.storage_local_path)

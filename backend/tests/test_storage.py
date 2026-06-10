"""Storage backend selection and the S3 backend's save/read/delete round-trip.

boto3 is not a hard dependency, so the S3 test injects a fake ``boto3`` module that keeps
objects in memory — enough to exercise S3Storage's contract without real AWS.
"""

from __future__ import annotations

import io
import sys
import types

import pytest

from app.core import storage as storage_module
from app.core.storage import LocalStorage, get_storage


def test_local_storage_roundtrip(tmp_path):
    store = LocalStorage(str(tmp_path))
    store.save("abc", b"hello")
    assert store.read("abc") == b"hello"
    store.delete("abc")
    store.delete("abc")  # idempotent


def test_get_storage_defaults_to_local(monkeypatch, tmp_path):
    monkeypatch.setattr(storage_module.settings, "storage_backend", "local")
    monkeypatch.setattr(storage_module.settings, "storage_local_path", str(tmp_path))
    assert isinstance(get_storage(), LocalStorage)


class _FakeS3Client:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def put_object(self, Bucket, Key, Body):  # noqa: N803 (boto3 kwarg names)
        self.objects[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):  # noqa: N803
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def delete_object(self, Bucket, Key):  # noqa: N803
        self.objects.pop((Bucket, Key), None)


@pytest.fixture
def fake_boto3(monkeypatch):
    client = _FakeS3Client()
    module = types.ModuleType("boto3")
    module.client = lambda *a, **k: client  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "boto3", module)
    return client


def test_s3_storage_roundtrip_with_prefix(fake_boto3):
    from app.core.storage import S3Storage

    store = S3Storage("my-bucket", prefix="media/")
    store.save("key1", b"bytes!")
    # Object lands under the prefix in the bucket.
    assert fake_boto3.objects[("my-bucket", "media/key1")] == b"bytes!"
    assert store.read("key1") == b"bytes!"
    store.delete("key1")
    assert ("my-bucket", "media/key1") not in fake_boto3.objects


def test_get_storage_selects_s3(monkeypatch, fake_boto3):
    monkeypatch.setattr(storage_module.settings, "storage_backend", "s3")
    monkeypatch.setattr(storage_module.settings, "s3_bucket", "my-bucket")
    monkeypatch.setattr(storage_module.settings, "s3_prefix", "")
    from app.core.storage import S3Storage

    assert isinstance(get_storage(), S3Storage)


def test_s3_requires_bucket(fake_boto3):
    from app.core.storage import S3Storage

    with pytest.raises(ValueError, match="S3_BUCKET"):
        S3Storage("")

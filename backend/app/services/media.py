"""Business logic for uploading and retrieving media files."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.storage import get_storage
from app.models.media import MediaFile


async def save_upload(
    db: AsyncSession,
    form_id: uuid.UUID,
    *,
    data: bytes,
    filename: str,
    content_type: str | None,
    respondent_id: uuid.UUID | None = None,
) -> MediaFile:
    """Persist an uploaded file's bytes (blob storage) and metadata (DB)."""
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise ValidationError(f"File is too large (max {settings.max_upload_mb} MB).")
    if not data:
        raise ValidationError("Uploaded file is empty.")

    media = MediaFile(
        form_id=form_id,
        filename=filename or "upload",
        content_type=content_type or "application/octet-stream",
        size=len(data),
        respondent_id=respondent_id,
    )
    db.add(media)
    await db.flush()  # assigns media.id

    get_storage().save(str(media.id), data)
    return media


async def get_media(db: AsyncSession, media_id: uuid.UUID) -> MediaFile:
    media = await db.get(MediaFile, media_id)
    if media is None:
        raise NotFoundError("File not found")
    return media


def read_bytes(media: MediaFile) -> bytes:
    return get_storage().read(str(media.id))


def media_url(media: MediaFile) -> str:
    return f"/api/v1/media/{media.id}"

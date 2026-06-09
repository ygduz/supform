"""Media endpoints: upload a file against a form, and download it (owner only)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_optional_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.api import MediaOut
from app.services import media as media_service
from app.services.forms import get_owned_form, get_published_schema

router = APIRouter(tags=["media"])


@router.post("/forms/{form_id}/uploads", response_model=MediaOut, status_code=201)
async def upload_file(
    form_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> MediaOut:
    """Public: upload a file for a file/image field on a published form.

    Returns a reference the client stores as that field's answer; the bytes are bound to
    the form so only the form's owner can download them later.
    """
    await get_published_schema(db, form_id)  # 404 unless the form is published
    media = await media_service.save_upload(
        db,
        form_id,
        data=await file.read(),
        filename=file.filename or "upload",
        content_type=file.content_type,
        respondent_id=user.id if user else None,
    )
    return MediaOut(
        id=media.id,
        filename=media.filename,
        content_type=media.content_type,
        size=media.size,
        url=media_service.media_url(media),
    )


@router.get("/media/{media_id}")
async def download_file(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Download an uploaded file. Restricted to the owner of the file's form."""
    media = await media_service.get_media(db, media_id)
    await get_owned_form(db, media.form_id, user.id)  # 404 if not the owner
    return Response(
        content=media_service.read_bytes(media),
        media_type=media.content_type,
        headers={"Content-Disposition": f'inline; filename="{media.filename}"'},
    )

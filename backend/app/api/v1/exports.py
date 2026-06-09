"""Export endpoint: download a published form's submissions as CSV/XLSX/JSON."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.exceptions import ValidationError
from app.db.session import get_db
from app.exporters import export_csv, export_json, export_xlsx
from app.models.submission import Submission
from app.models.user import User
from app.services.forms import get_owned_form, get_published_schema

router = APIRouter(tags=["exports"])

# Map each format to its exporter, MIME type, and file extension in one place so adding a
# format is a single-line change and Content-Type never drifts from the body.
_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_FORMATS = {
    "csv": (export_csv, "text/csv", "csv"),
    "xlsx": (export_xlsx, _XLSX_MIME, "xlsx"),
    "json": (export_json, "application/json", "json"),
}


@router.get("/forms/{form_id}/export")
async def export_submissions(
    form_id: uuid.UUID,
    format: str = "csv",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Stream the form's submissions in the requested format as a file download."""
    if format not in _FORMATS:
        raise ValidationError(f"Unsupported export format: {format!r}")

    await get_owned_form(db, form_id, user.id)
    schema = await get_published_schema(db, form_id)

    stmt = (
        select(Submission)
        .where(Submission.form_id == form_id)
        .order_by(Submission.created_at.asc())
    )
    submissions: list[dict[str, Any]] = [
        {"id": str(sub.id), "created_at": sub.created_at, "answers": sub.answers}
        for sub in await db.scalars(stmt)
    ]

    exporter, media_type, ext = _FORMATS[format]
    payload = exporter(schema, submissions)
    body = payload if isinstance(payload, bytes) else payload.encode("utf-8")

    filename = f"{schema.name}-submissions.{ext}"
    return Response(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

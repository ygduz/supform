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
from app.exporters import export_csv, export_geojson, export_json, export_spss, export_xlsx
from app.models.submission import Submission
from app.models.user import User
from app.schemas.api import ExportJobOut
from app.services import exports as exports_service
from app.services.forms import get_owned_form, get_published_schema

router = APIRouter(tags=["exports"])


def _job_out(job: object) -> ExportJobOut:
    out = ExportJobOut.model_validate(job)
    if out.status == "done":
        out.download_url = f"/api/v1/exports/{out.id}/download"
    return out


# Map each format to its exporter, MIME type, and file extension in one place so adding a
# format is a single-line change and Content-Type never drifts from the body.
_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_SPSS_MIME = "application/x-spss-sav"
_FORMATS = {
    "csv": (export_csv, "text/csv", "csv"),
    "xlsx": (export_xlsx, _XLSX_MIME, "xlsx"),
    "json": (export_json, "application/json", "json"),
    "geojson": (export_geojson, "application/geo+json", "geojson"),
    "spss": (export_spss, _SPSS_MIME, "sav"),
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
        {
            "id": str(sub.id),
            "created_at": sub.created_at,
            "answers": sub.answers,
            "metadata": sub.metadata_,
        }
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


@router.post("/forms/{form_id}/exports", response_model=ExportJobOut, status_code=202)
async def enqueue_export(
    form_id: uuid.UUID,
    format: str = "csv",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExportJobOut:
    """Queue an export to run in the background; poll the returned job for completion."""
    await get_owned_form(db, form_id, user.id)
    job = await exports_service.create_export_job(db, form_id, user.id, format)
    # Commit so the worker (a separate process) can see the job before it runs.
    await db.commit()
    exports_service.dispatch_export(job.id)
    return _job_out(job)


@router.get("/exports/{job_id}", response_model=ExportJobOut)
async def get_export_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExportJobOut:
    job = await exports_service.get_job(db, job_id)
    await get_owned_form(db, job.form_id, user.id)  # 404 unless the caller owns the form
    return _job_out(job)


@router.get("/exports/{job_id}/download")
async def download_export(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    job = await exports_service.get_job(db, job_id)
    await get_owned_form(db, job.form_id, user.id)
    if job.status != "done":
        raise ValidationError(f"Export is not ready (status: {job.status}).")
    return Response(
        content=exports_service.read_result(job),
        media_type=exports_service.media_type(job),
        headers={"Content-Disposition": f'attachment; filename="{job.filename}"'},
    )

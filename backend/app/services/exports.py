"""Asynchronous export jobs.

A request enqueues an :class:`ExportJob` and a Celery worker runs :func:`run_export_job`,
which generates the file with the same exporters the synchronous endpoint uses and writes
the bytes to blob storage. The client polls the job, then downloads the result. This keeps
large exports off the request/response path.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.storage import get_storage
from app.exporters import export_csv, export_json, export_xlsx
from app.models.export_job import ExportJob
from app.models.submission import Submission
from app.services.forms import get_published_schema

_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# format -> (exporter, mime, extension), shared with the synchronous export endpoint.
FORMATS = {
    "csv": (export_csv, "text/csv", "csv"),
    "xlsx": (export_xlsx, _XLSX_MIME, "xlsx"),
    "json": (export_json, "application/json", "json"),
}


def _storage_key(job_id: uuid.UUID) -> str:
    return f"export/{job_id}"


async def create_export_job(
    db: AsyncSession, form_id: uuid.UUID, user_id: uuid.UUID, fmt: str
) -> ExportJob:
    if fmt not in FORMATS:
        raise ValidationError(f"Unsupported export format: {fmt!r}")
    job = ExportJob(form_id=form_id, requested_by=user_id, format=fmt, status="pending")
    db.add(job)
    await db.flush()
    return job


async def get_job(db: AsyncSession, job_id: uuid.UUID) -> ExportJob:
    job = await db.get(ExportJob, job_id)
    if job is None:
        raise NotFoundError("Export job not found")
    return job


async def run_export_job(db: AsyncSession, job_id: uuid.UUID) -> ExportJob:
    """Generate the export and store the result. Records failure on the job, never raises."""
    job = await get_job(db, job_id)
    job.status = "running"
    await db.flush()
    try:
        schema = await get_published_schema(db, job.form_id)
        stmt = (
            select(Submission)
            .where(Submission.form_id == job.form_id)
            .order_by(Submission.created_at.asc())
        )
        submissions: list[dict[str, Any]] = [
            {"id": str(sub.id), "created_at": sub.created_at, "answers": sub.answers}
            for sub in await db.scalars(stmt)
        ]
        exporter, _, ext = FORMATS[job.format]
        payload = exporter(schema, submissions)
        data = payload if isinstance(payload, bytes) else payload.encode("utf-8")
        get_storage().save(_storage_key(job.id), data)
        job.filename = f"{schema.name}-submissions.{ext}"
        job.status = "done"
        job.error = None
    except Exception as exc:  # noqa: BLE001 - failures belong on the job, not the worker log
        job.status = "failed"
        job.error = str(exc)
    await db.flush()
    return job


def read_result(job: ExportJob) -> bytes:
    return get_storage().read(_storage_key(job.id))


def media_type(job: ExportJob) -> str:
    return FORMATS.get(job.format, (None, "application/octet-stream", ""))[1]


def dispatch_export(job_id: uuid.UUID) -> None:
    """Hand the job to a Celery worker. Isolated so tests can stub the broker call."""
    from app.workers.tasks import build_export

    build_export.delay(str(job_id))

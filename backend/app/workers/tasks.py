"""Async tasks. Heavy/slow work runs here, off the request path."""

from __future__ import annotations

import asyncio
import uuid

from app.workers.celery_app import celery_app


@celery_app.task(name="exports.build")
def build_export(job_id: str) -> dict[str, str]:
    """Run a queued export job to completion (generate + store the file)."""
    return asyncio.run(_build_export(job_id))


async def _build_export(job_id: str) -> dict[str, str]:
    # A worker is its own process with no running event loop, so a fresh async session
    # over the app engine is safe here (unlike calling this inline from a request).
    from app.db.session import SessionLocal
    from app.services.exports import run_export_job

    async with SessionLocal() as session:
        job = await run_export_job(session, uuid.UUID(job_id))
        await session.commit()
        return {"job_id": job_id, "status": job.status}

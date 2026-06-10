"""Async tasks. Heavy/slow work runs here, off the request path."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from app.workers.celery_app import celery_app


@celery_app.task(name="exports.build")
def build_export(job_id: str) -> dict[str, str]:
    """Run a queued export job to completion (generate + store the file)."""
    return asyncio.run(_build_export(job_id))


@celery_app.task(
    name="webhooks.deliver",
    bind=True,
    max_retries=5,
    default_retry_delay=15,
    acks_late=True,
)
def deliver_webhook(
    self, webhook_id: str, url: str, secret: str, payload: dict[str, Any]
) -> dict[str, Any]:
    """Deliver one signed webhook POST, retrying with backoff on failure."""
    from app.services.webhooks import deliver

    try:
        status = deliver(url, secret, payload)
        return {"webhook_id": webhook_id, "status": status}
    except Exception as exc:  # transport error or non-2xx — retry with backoff
        raise self.retry(exc=exc, countdown=15 * (2**self.request.retries)) from exc


@celery_app.task(name="notifications.send", bind=True, max_retries=3, default_retry_delay=30)
def send_notification(self, emails: list[str], subject: str, body: str) -> dict[str, Any]:
    """Email a new-response notification to each recipient via the configured backend."""
    from app.core.config import settings
    from app.core.email import send_email

    rendered = body.replace("{app}", settings.app_base_url)
    try:
        for to in emails:
            send_email(to, subject, rendered)
        return {"sent": len(emails)}
    except Exception as exc:  # mail server hiccup — retry with backoff
        raise self.retry(exc=exc) from exc


async def _build_export(job_id: str) -> dict[str, str]:
    # A worker is its own process with no running event loop, so a fresh async session
    # over the app engine is safe here (unlike calling this inline from a request).
    from app.db.session import SessionLocal
    from app.services.exports import run_export_job

    async with SessionLocal() as session:
        job = await run_export_job(session, uuid.UUID(job_id))
        await session.commit()
        return {"job_id": job_id, "status": job.status}

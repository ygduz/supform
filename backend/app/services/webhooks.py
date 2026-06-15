"""Outbound webhooks: register endpoints and deliver signed submission events.

Delivery is offloaded to Celery so a slow or failing receiver never blocks (or breaks)
a respondent's submission. Each payload is signed with the webhook's secret using
HMAC-SHA256 so receivers can verify it really came from this server.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.ssrf import assert_safe_url
from app.models.form import Form
from app.models.submission import Submission
from app.models.webhook import Webhook
from app.models.webhook_delivery import WebhookDelivery

SUBMISSION_CREATED = "submission.created"
SIGNATURE_HEADER = "X-Supform-Signature"


async def list_webhooks(db: AsyncSession, form_id: uuid.UUID) -> list[Webhook]:
    stmt = select(Webhook).where(Webhook.form_id == form_id).order_by(Webhook.created_at)
    return list(await db.scalars(stmt))


async def create_webhook(
    db: AsyncSession,
    form_id: uuid.UUID,
    url: str,
    *,
    secret: str | None = None,
    event: str = SUBMISSION_CREATED,
) -> Webhook:
    assert_safe_url(url)
    if event != SUBMISSION_CREATED:
        raise ValidationError(f"Unsupported event: {event!r}", details={"event": event})
    webhook = Webhook(
        form_id=form_id,
        url=url,
        secret=secret or secrets.token_hex(16),
        event=event,
        active=True,
    )
    db.add(webhook)
    await db.flush()
    return webhook


async def get_webhook(db: AsyncSession, form_id: uuid.UUID, webhook_id: uuid.UUID) -> Webhook:
    webhook = await db.get(Webhook, webhook_id)
    if webhook is None or webhook.form_id != form_id:
        raise NotFoundError("Webhook not found")
    return webhook


async def update_webhook(
    db: AsyncSession,
    form_id: uuid.UUID,
    webhook_id: uuid.UUID,
    *,
    url: str | None = None,
    active: bool | None = None,
) -> Webhook:
    webhook = await get_webhook(db, form_id, webhook_id)
    if url is not None:
        assert_safe_url(url)
        webhook.url = url
    if active is not None:
        webhook.active = active
    await db.flush()
    return webhook


async def delete_webhook(db: AsyncSession, form_id: uuid.UUID, webhook_id: uuid.UUID) -> None:
    webhook = await get_webhook(db, form_id, webhook_id)
    await db.delete(webhook)
    await db.flush()


def build_payload(form: Form, submission: Submission) -> dict[str, Any]:
    """The JSON body delivered to webhook receivers for a new submission."""
    return {
        "event": SUBMISSION_CREATED,
        "form": {"id": str(form.id), "name": form.name},
        "submission": {
            "id": str(submission.id),
            "form_version": submission.form_version,
            "answers": submission.answers,
            "metadata": submission.metadata_,
            "source": submission.source,
            "created_at": submission.created_at.isoformat()
            if submission.created_at is not None
            else None,
        },
    }


def sign(secret: str, body: bytes) -> str:
    """HMAC-SHA256 of the raw body, hex-encoded (the value of the signature header)."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def dispatch_submission_event(db: AsyncSession, form: Form, submission: Submission) -> None:
    """Enqueue a signed delivery for every active webhook on the form.

    Builds a self-contained payload and snapshots each webhook's url/secret, so the
    worker needs no DB access and is unaffected by later edits to the webhook.
    """
    stmt = select(Webhook).where(
        Webhook.form_id == form.id,
        Webhook.active.is_(True),
        Webhook.event == SUBMISSION_CREATED,
    )
    webhooks = list(await db.scalars(stmt))
    if not webhooks:
        return

    payload = build_payload(form, submission)
    for webhook in webhooks:
        enqueue_delivery(str(webhook.id), webhook.url, webhook.secret, payload)


def enqueue_delivery(webhook_id: str, url: str, secret: str, payload: dict[str, Any]) -> None:
    """Hand one delivery to a Celery worker. Isolated so tests can stub the broker call."""
    from app.workers.tasks import deliver_webhook

    deliver_webhook.delay(webhook_id, url, secret, payload)


def deliver(url: str, secret: str, payload: dict[str, Any], *, timeout: float = 10.0) -> int:
    """Synchronously POST a signed payload; returns the HTTP status code.

    Lives here (not in the task) so it can be unit-tested without Celery. Raises on
    transport errors so the Celery task can retry.
    """
    import httpx

    # Re-check at delivery time too: the host may resolve differently now (DNS rebinding)
    # than it did when the webhook was created.
    assert_safe_url(url)

    body = json.dumps(payload, separators=(",", ":")).encode()
    headers = {
        "Content-Type": "application/json",
        SIGNATURE_HEADER: sign(secret, body),
        "X-Supform-Event": payload.get("event", SUBMISSION_CREATED),
    }
    response = httpx.post(url, content=body, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response.status_code


async def log_delivery(
    db: AsyncSession,
    *,
    webhook_id: uuid.UUID,
    url: str,
    status_code: int | None,
    error: str | None,
    duration_ms: int | None,
    is_test: bool = False,
) -> WebhookDelivery:
    entry = WebhookDelivery(
        webhook_id=webhook_id,
        url=url,
        status_code=status_code,
        error=error,
        duration_ms=duration_ms,
        is_test=is_test,
    )
    db.add(entry)
    await db.flush()
    return entry


async def list_deliveries(
    db: AsyncSession,
    webhook_id: uuid.UUID,
    *,
    limit: int = 50,
) -> list[WebhookDelivery]:
    stmt = (
        select(WebhookDelivery)
        .where(WebhookDelivery.webhook_id == webhook_id)
        .order_by(WebhookDelivery.created_at.desc())
        .limit(limit)
    )
    return list(await db.scalars(stmt))


def _test_payload(webhook: Webhook) -> dict[str, Any]:
    """A synthetic payload used by the test-delivery endpoint."""
    return {
        "event": webhook.event,
        "form": {"id": str(webhook.form_id), "name": "test"},
        "submission": {
            "id": str(uuid.uuid4()),
            "form_version": 1,
            "answers": {},
            "metadata": {},
            "source": "test",
            "created_at": None,
        },
        "_test": True,
    }


async def test_delivery(
    db: AsyncSession, form_id: uuid.UUID, webhook_id: uuid.UUID
) -> WebhookDelivery:
    """Fire a synthetic delivery and log the result. Returns the delivery log entry."""
    webhook = await get_webhook(db, form_id, webhook_id)
    payload = _test_payload(webhook)
    t0 = time.monotonic()
    status_code: int | None = None
    error: str | None = None
    try:
        status_code = deliver(webhook.url, webhook.secret, payload)
    except Exception as exc:
        error = str(exc)[:500]
    duration_ms = int((time.monotonic() - t0) * 1000)
    return await log_delivery(
        db,
        webhook_id=webhook_id,
        url=webhook.url,
        status_code=status_code,
        error=error,
        duration_ms=duration_ms,
        is_test=True,
    )

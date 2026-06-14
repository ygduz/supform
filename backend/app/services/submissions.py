"""Business logic for accepting and storing submissions."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthError, PermissionDeniedError, ValidationError
from app.form_engine import compute_score, validate_submission
from app.models.submission import Submission
from app.schemas.form_schema import FormSettings
from app.services.forms import get_form, get_published_schema

_META_TYPES = frozenset(["start", "end", "today", "deviceid", "username"])


def _inject_metadata_fields(
    schema_elements: list[Any],
    answers: dict[str, Any],
    now: datetime,
    respondent_email: str | None,
) -> None:
    """Walk the schema and fill any metadata-capture fields in `answers` if not already set."""
    for el in schema_elements:
        if el.type in ("group", "repeat") and el.elements:
            _inject_metadata_fields(el.elements, answers, now, respondent_email)
            continue
        t = str(el.type)
        if t not in _META_TYPES or el.name in answers:
            continue
        if t == "start":
            answers[el.name] = now.isoformat()
        elif t == "end":
            answers[el.name] = now.isoformat()
        elif t == "today":
            answers[el.name] = now.date().isoformat()
        elif t == "deviceid":
            answers[el.name] = "server"
        elif t == "username":
            answers[el.name] = respondent_email or ""


async def create_submission(
    db: AsyncSession,
    form_id: uuid.UUID,
    answers: dict[str, Any],
    *,
    metadata: dict[str, Any] | None = None,
    respondent_id: uuid.UUID | None = None,
    source: str = "web",
    respondent_email: str | None = None,
) -> Submission:
    form = await get_form(db, form_id)
    if form.status == "archived":
        raise PermissionDeniedError("This form is no longer accepting responses.")

    schema = await get_published_schema(db, form_id)
    await _enforce_acceptance(db, form_id, schema.settings, respondent_id)

    # Inject metadata-capture fields before validation so they pass required checks.
    now = datetime.now(UTC)
    all_elements = [el for page in schema.pages for el in page.elements]
    _inject_metadata_fields(all_elements, answers, now, respondent_email)

    result = validate_submission(schema, answers)
    if not result.is_valid:
        raise ValidationError("Submission failed validation", details=result.errors)

    meta = dict(metadata or {})
    if schema.settings.quiz_mode:
        # Server-computed so a client can't inflate its own score.
        meta["_score"] = compute_score(schema, result.cleaned)

    submission = Submission(
        form_id=form_id,
        form_version=schema.version,
        answers=result.cleaned,
        metadata_=meta,
        respondent_id=respondent_id,
        source=source,
    )
    db.add(submission)
    await db.flush()
    return submission


async def _enforce_acceptance(
    db: AsyncSession,
    form_id: uuid.UUID,
    settings: FormSettings,
    respondent_id: uuid.UUID | None,
) -> None:
    """Apply a published form's collection settings before a response is stored."""
    if settings.require_login and respondent_id is None:
        raise AuthError("You must sign in to submit this form.")

    if settings.close_date and _is_past(settings.close_date):
        raise PermissionDeniedError("This form is closed and no longer accepting responses.")

    if settings.max_responses is not None:
        count = await db.scalar(
            select(func.count()).select_from(Submission).where(Submission.form_id == form_id)
        )
        if (count or 0) >= settings.max_responses:
            raise PermissionDeniedError("This form has reached its response limit.")

    # We can only dedupe when the respondent is identified (signed in).
    if not settings.allow_multiple_submissions and respondent_id is not None:
        existing = await db.scalar(
            select(Submission.id)
            .where(Submission.form_id == form_id, Submission.respondent_id == respondent_id)
            .limit(1)
        )
        if existing:
            raise PermissionDeniedError("You have already responded to this form.")


def _is_past(close_date: str) -> bool:
    try:
        dt = datetime.fromisoformat(close_date.replace("Z", "+00:00"))
    except ValueError:
        return False  # an unparseable date never closes the form
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return datetime.now(UTC) > dt

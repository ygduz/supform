"""Business logic for accepting and storing submissions."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.form_engine import validate_submission
from app.models.submission import Submission
from app.services.forms import get_published_schema


async def create_submission(
    db: AsyncSession,
    form_id: uuid.UUID,
    answers: dict[str, Any],
    *,
    metadata: dict[str, Any] | None = None,
    respondent_id: uuid.UUID | None = None,
    source: str = "web",
) -> Submission:
    schema = await get_published_schema(db, form_id)
    result = validate_submission(schema, answers)
    if not result.is_valid:
        raise ValidationError("Submission failed validation", details=result.errors)

    submission = Submission(
        form_id=form_id,
        form_version=schema.version,
        answers=result.cleaned,
        metadata_=metadata or {},
        respondent_id=respondent_id,
        source=source,
    )
    db.add(submission)
    await db.flush()
    return submission

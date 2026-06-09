"""Submission endpoints (public submit + authenticated listing)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_optional_user
from app.db.session import get_db
from app.models.submission import Submission
from app.models.user import User
from app.schemas.api import SubmissionCreate, SubmissionOut
from app.services import forms as forms_service
from app.services import submissions as submissions_service

router = APIRouter(tags=["submissions"])


@router.post("/forms/{form_id}/submissions", response_model=SubmissionOut, status_code=201)
async def submit(
    form_id: uuid.UUID,
    payload: SubmissionCreate,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """Public endpoint: submit a response to a published form.

    Anonymous by default; if a valid token is sent the respondent is recorded, which
    enables ``requireLogin`` and single-submission enforcement.
    """
    return await submissions_service.create_submission(
        db,
        form_id,
        payload.answers,
        metadata=payload.metadata,
        respondent_id=user.id if user else None,
    )


@router.get("/forms/{form_id}/submissions", response_model=list[SubmissionOut])
async def list_submissions(
    form_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await forms_service.get_owned_form(db, form_id, user.id)
    stmt = (
        select(Submission)
        .where(Submission.form_id == form_id)
        .order_by(Submission.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(await db.scalars(stmt))

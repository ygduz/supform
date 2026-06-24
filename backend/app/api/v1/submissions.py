"""Submission endpoints (public submit + authenticated listing/review)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_optional_user
from app.core.exceptions import NotFoundError, ValidationError
from app.core.ratelimit import rate_limit
from app.db.session import get_db
from app.form_engine import validate_submission
from app.models.submission import VALIDATION_STATUSES, Submission
from app.models.submission_edit import SubmissionEdit
from app.models.user import User
from app.schemas.api import (
    SubmissionAnswersUpdate,
    SubmissionCreate,
    SubmissionEditOut,
    SubmissionOut,
    ValidationUpdate,
)
from app.services import forms as forms_service
from app.services import notifications as notifications_service
from app.services import submissions as submissions_service
from app.services import webhooks as webhooks_service

router = APIRouter(tags=["submissions"])

# The public submit endpoint is unauthenticated; throttle per IP to limit spam floods.
_submit_throttle = rate_limit(30, 60, scope="submit")


@router.post(
    "/forms/{form_id}/submissions",
    response_model=SubmissionOut,
    status_code=201,
    dependencies=[Depends(_submit_throttle)],
)
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
    submission = await submissions_service.create_submission(
        db,
        form_id,
        payload.answers,
        metadata=payload.metadata,
        respondent_id=user.id if user else None,
    )
    # Persist before notifying, so webhooks only fire for responses that were stored.
    await db.commit()
    form = await forms_service.get_form(db, form_id)
    await webhooks_service.dispatch_submission_event(db, form, submission)
    await notifications_service.dispatch_submission_notification(db, form, submission)
    return submission


@router.get("/forms/{form_id}/submissions", response_model=list[SubmissionOut])
async def list_submissions(
    form_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    validation_status: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await forms_service.get_owned_form(db, form_id, user.id)
    stmt = select(Submission).where(Submission.form_id == form_id)
    if validation_status is not None:
        stmt = stmt.where(Submission.validation_status == validation_status)
    stmt = stmt.order_by(Submission.created_at.desc()).limit(limit).offset(offset)
    return list(await db.scalars(stmt))


async def _owned_submission(
    db: AsyncSession, form_id: uuid.UUID, submission_id: uuid.UUID, user: User, *, min_role: str
) -> Submission:
    await forms_service.get_owned_form(db, form_id, user.id, min_role=min_role)
    submission = await db.get(Submission, submission_id)
    if submission is None or submission.form_id != form_id:
        raise NotFoundError("Submission not found")
    return submission


@router.patch(
    "/forms/{form_id}/submissions/{submission_id}/validation", response_model=SubmissionOut
)
async def set_validation_status(
    form_id: uuid.UUID,
    submission_id: uuid.UUID,
    payload: ValidationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark a submission approved / not_approved / on_hold (or clear it). Editor+."""
    if payload.status is not None and payload.status not in VALIDATION_STATUSES:
        raise ValidationError(
            f"status must be one of {', '.join(VALIDATION_STATUSES)} or null",
            details={"status": payload.status},
        )
    submission = await _owned_submission(db, form_id, submission_id, user, min_role="editor")
    submission.validation_status = payload.status
    submission.validated_by = user.id if payload.status else None
    submission.validated_at = datetime.now(UTC) if payload.status else None
    await db.commit()
    return submission


@router.patch("/forms/{form_id}/submissions/{submission_id}", response_model=SubmissionOut)
async def edit_submission(
    form_id: uuid.UUID,
    submission_id: uuid.UUID,
    payload: SubmissionAnswersUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a submission's answers. Re-validates against the published schema. Editor+."""
    submission = await _owned_submission(db, form_id, submission_id, user, min_role="editor")
    schema = await forms_service.get_published_schema(db, form_id)
    result = validate_submission(schema, payload.answers)
    if not result.is_valid:
        raise ValidationError("Edited answers failed validation", details=result.errors)
    old_answers = dict(submission.answers)
    new_answers = result.cleaned
    all_keys = set(list(old_answers) + list(new_answers))
    changed = [k for k in all_keys if old_answers.get(k) != new_answers.get(k)]
    if changed:
        db.add(
            SubmissionEdit(
                submission_id=submission.id,
                edited_by=user.id,
                answers_before=old_answers,
                answers_after=new_answers,
                changed_fields=changed,
            )
        )
    submission.answers = new_answers
    await db.commit()
    return submission


@router.delete("/forms/{form_id}/submissions/{submission_id}", status_code=204)
async def delete_submission(
    form_id: uuid.UUID,
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Delete a single response. Editor+."""
    submission = await _owned_submission(db, form_id, submission_id, user, min_role="editor")
    await db.delete(submission)
    await db.commit()


@router.patch("/submissions/{submission_id}/workflow-step")
async def set_workflow_step(
    submission_id: uuid.UUID,
    step: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubmissionOut:
    """Move a submission to a specific workflow step. Editor+ on the owning project."""
    sub = await db.get(Submission, submission_id)
    if sub is None:
        raise NotFoundError("Submission not found")
    # Authorize through the project-membership model (editor+), consistent with the
    # other submission mutations. A non-member gets a 404 (existence is never leaked).
    await forms_service.get_owned_form(db, sub.form_id, user.id, min_role="editor")
    sub.workflow_step = step
    await db.commit()
    await db.refresh(sub)
    return SubmissionOut.model_validate(sub)


@router.get(
    "/forms/{form_id}/submissions/{submission_id}/edits",
    response_model=list[SubmissionEditOut],
)
async def get_submission_edits(
    form_id: uuid.UUID,
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the edit history for a single submission. Editor+."""
    await _owned_submission(db, form_id, submission_id, user, min_role="editor")
    result = await db.execute(
        select(SubmissionEdit)
        .where(SubmissionEdit.submission_id == submission_id)
        .order_by(SubmissionEdit.created_at.desc())
    )
    edits = list(result.scalars())
    return [
        SubmissionEditOut(
            id=e.id,
            edited_by=e.edited_by,
            answers_before=e.answers_before,
            answers_after=e.answers_after,
            changed_fields=e.changed_fields,
            created_at=e.created_at,
        )
        for e in edits
    ]

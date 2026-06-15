"""Cross-form submission inbox with mark-as-read."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.form import Form
from app.models.project import Project
from app.models.submission import Submission
from app.models.user import User
from app.schemas.api import SubmissionOut

router = APIRouter(tags=["inbox"])


def _localize_title(title: object) -> str | None:
    """Extract a plain string from a possibly-i18n title field."""
    if title is None:
        return None
    if isinstance(title, str):
        return title or None
    if isinstance(title, dict):
        return next(iter(title.values()), None)
    return str(title)


@router.get("/inbox", response_model=list[SubmissionOut])
async def list_inbox(
    unread_only: bool = False,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SubmissionOut]:
    """Return the caller's recent submissions across all owned forms, newest first."""
    owned_form_ids_stmt = (
        select(Form.id)
        .join(Project, Form.project_id == Project.id)
        .where(Project.owner_id == user.id)
    )
    owned_form_ids = list(await db.scalars(owned_form_ids_stmt))

    if not owned_form_ids:
        return []

    stmt = (
        select(Submission, Form.title.label("form_title"))
        .join(Form, Submission.form_id == Form.id)
        .where(Submission.form_id.in_(owned_form_ids))
        .order_by(Submission.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        stmt = stmt.where(Submission.read_at.is_(None))

    results = list(await db.execute(stmt))
    out = []
    for sub, raw_title in results:
        data = SubmissionOut.model_validate(sub)
        data.form_title = _localize_title(raw_title)
        out.append(data)
    return out


@router.patch("/inbox/{submission_id}/read", response_model=SubmissionOut)
async def mark_read(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubmissionOut:
    """Mark a submission as read (only the form owner may do this)."""
    sub = await db.get(Submission, submission_id)
    if sub is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Submission not found")

    form = await db.get(Form, sub.form_id)
    proj = await db.get(Project, form.project_id) if form else None
    if proj is None or proj.owner_id != user.id:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Submission not found")

    sub.read_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(sub)
    return SubmissionOut.model_validate(sub)


@router.patch("/inbox/read-all", response_model=dict)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Mark all submissions across owned forms as read."""
    from sqlalchemy import update

    form_ids_stmt = (
        select(Form.id)
        .join(Project, Form.project_id == Project.id)
        .where(Project.owner_id == user.id)
    )
    form_ids = list(await db.scalars(form_ids_stmt))
    if form_ids:
        now = datetime.now(UTC)
        await db.execute(
            update(Submission)
            .where(Submission.form_id.in_(form_ids), Submission.read_at.is_(None))
            .values(read_at=now)
        )
        await db.commit()
    return {"ok": True}

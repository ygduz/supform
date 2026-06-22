"""Business logic for forms: validate, persist drafts, and publish immutable versions."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.form_engine import validate_form
from app.models.export_job import ExportJob
from app.models.form import Form, FormVersion
from app.models.form_audit import FormAuditLog
from app.models.media import MediaFile
from app.models.project import Project
from app.models.project_membership import ProjectMembership
from app.models.submission import Submission
from app.models.webhook import Webhook
from app.schemas.form_schema import FormSchema
from app.services import memberships


async def get_form(db: AsyncSession, form_id: uuid.UUID) -> Form:
    form = await db.get(Form, form_id)
    if form is None:
        raise NotFoundError("Form not found")
    return form


async def get_owned_form(
    db: AsyncSession, form_id: uuid.UUID, user_id: uuid.UUID, min_role: str = "viewer"
) -> Form:
    """Fetch a form only if the caller has at least ``min_role`` on its project.

    This is the per-object authorization gate for every form action. Read actions
    pass ``viewer``; mutating actions (edit/publish) pass ``editor``. A caller with no
    role on the project gets a 404 (existence is never revealed); a caller whose role
    is too low for the action gets a 403.
    """
    form = await get_form(db, form_id)
    try:
        await memberships.require_project_role(db, form.project_id, user_id, min_role)
    except NotFoundError:
        # Don't leak the form's existence to a non-member.
        raise NotFoundError("Form not found") from None
    return form


async def list_forms(db: AsyncSession, user_id: uuid.UUID) -> list[tuple[Form, int]]:
    """Every form the user can see (owned or shared projects), with its response count.

    One grouped subquery supplies the counts so the dashboard never goes N+1.
    Most-recently-edited first — the form you're working on is the one you want.
    """
    counts = (
        select(Submission.form_id, func.count(Submission.id).label("cnt"))
        .group_by(Submission.form_id)
        .subquery()
    )
    stmt = (
        select(Form, func.coalesce(counts.c.cnt, 0))
        .join(Project, Project.id == Form.project_id)
        .outerjoin(ProjectMembership, ProjectMembership.project_id == Project.id)
        .outerjoin(counts, counts.c.form_id == Form.id)
        .where(or_(Project.owner_id == user_id, ProjectMembership.user_id == user_id))
        .distinct()
        .order_by(Form.updated_at.desc())
    )
    return [(form, count) for form, count in (await db.execute(stmt)).all()]


async def _log_action(
    db: AsyncSession,
    form_id: uuid.UUID,
    user_id: uuid.UUID | None,
    action: str,
    summary: str | None = None,
) -> None:
    db.add(FormAuditLog(form_id=form_id, user_id=user_id, action=action, summary=summary))


async def delete_form(db: AsyncSession, form_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Permanently delete a form and everything hanging off it. Owner-only.

    Versions and submissions cascade at the ORM level; webhooks, export jobs, and media
    rows are removed explicitly so the behavior is identical on Postgres and the SQLite
    test database (which doesn't enforce FK cascades).
    """
    form = await get_owned_form(db, form_id, user_id, min_role="owner")
    await db.execute(delete(Webhook).where(Webhook.form_id == form_id))
    await db.execute(delete(ExportJob).where(ExportJob.form_id == form_id))
    await db.execute(delete(MediaFile).where(MediaFile.form_id == form_id))
    await db.delete(form)
    await db.flush()


async def create_form(
    db: AsyncSession, project_id: uuid.UUID, content: FormSchema, owner_id: uuid.UUID
) -> Form:
    _assert_valid(content)
    await memberships.require_project_role(db, project_id, owner_id, "editor")
    form = Form(
        project_id=project_id,
        name=content.name,
        title=_plain(content.title),
        draft_content=content.model_dump(by_alias=True, mode="json"),
    )
    db.add(form)
    await db.flush()
    await _log_action(db, form.id, owner_id, "created")
    return form


async def duplicate_form(db: AsyncSession, form_id: uuid.UUID, user_id: uuid.UUID) -> Form:
    """Create a copy of the form's draft in the same project. Editor+ only."""
    source = await get_owned_form(db, form_id, user_id, min_role="editor")
    content = FormSchema.model_validate(source.draft_content)
    # Give the copy a distinct name so both can live in the form list.
    content.name = f"{content.name} (copy)"
    copy = Form(
        project_id=source.project_id,
        name=content.name,
        title=_plain(content.title),
        draft_content=content.model_dump(by_alias=True, mode="json"),
    )
    db.add(copy)
    await db.flush()
    return copy


async def update_draft(
    db: AsyncSession, form_id: uuid.UUID, content: FormSchema, user_id: uuid.UUID
) -> Form:
    _assert_valid(content)
    form = await get_owned_form(db, form_id, user_id, min_role="editor")
    form.title = _plain(content.title)
    form.draft_content = content.model_dump(by_alias=True, mode="json")
    await db.flush()
    await _log_action(db, form_id, user_id, "draft_saved")
    return form


async def publish_form(db: AsyncSession, form_id: uuid.UUID, user_id: uuid.UUID) -> FormVersion:
    """Freeze the current draft as the next immutable version."""
    form = await get_owned_form(db, form_id, user_id, min_role="editor")
    content = FormSchema.model_validate(form.draft_content)
    _assert_valid(content)
    # A draft may legitimately be empty mid-edit, but publishing one yields a
    # blank form respondents can't use — block it at the version boundary.
    if not any(page.elements for page in content.pages):
        raise ValidationError("Add at least one question before publishing.")

    next_version = (form.current_version or 0) + 1
    content.version = next_version
    snapshot = FormVersion(
        form_id=form.id,
        version=next_version,
        content=content.model_dump(by_alias=True, mode="json"),
    )
    db.add(snapshot)
    form.current_version = next_version
    form.status = "published"
    await db.flush()
    await _log_action(db, form.id, user_id, "published", f"v{next_version}")
    return snapshot


async def get_published_schema(db: AsyncSession, form_id: uuid.UUID) -> FormSchema:
    form = await get_form(db, form_id)
    if form.current_version is None:
        raise NotFoundError("Form has no published version")
    stmt = select(FormVersion).where(
        FormVersion.form_id == form_id, FormVersion.version == form.current_version
    )
    version = (await db.execute(stmt)).scalar_one()
    return FormSchema.model_validate(version.content)


async def list_form_audit(
    db: AsyncSession, form_id: uuid.UUID, user_id: uuid.UUID, limit: int = 50
) -> list[FormAuditLog]:
    """Return the most recent audit log entries for a form."""
    await get_owned_form(db, form_id, user_id, min_role="viewer")
    result = await db.execute(
        select(FormAuditLog)
        .where(FormAuditLog.form_id == form_id)
        .order_by(FormAuditLog.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars())


async def list_form_versions(
    db: AsyncSession, form_id: uuid.UUID, user_id: uuid.UUID
) -> list[FormVersion]:
    """Return all published versions of a form, newest first."""
    await get_owned_form(db, form_id, user_id, min_role="viewer")
    result = await db.execute(
        select(FormVersion)
        .where(FormVersion.form_id == form_id)
        .order_by(FormVersion.version.desc())
    )
    return list(result.scalars())


def _assert_valid(content: FormSchema) -> None:
    issues = [i for i in validate_form(content) if i.level == "error"]
    if issues:
        raise ValidationError(
            "Form definition is invalid",
            details=[{"path": i.path, "message": i.message} for i in issues],
        )


def _plain(text: object) -> str:
    if isinstance(text, dict):
        return next(iter(text.values()), "")
    return str(text)

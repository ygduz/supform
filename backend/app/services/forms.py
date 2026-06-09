"""Business logic for forms: validate, persist drafts, and publish immutable versions."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.form_engine import validate_form
from app.models.form import Form, FormVersion
from app.models.project import Project
from app.schemas.form_schema import FormSchema


async def get_form(db: AsyncSession, form_id: uuid.UUID) -> Form:
    form = await db.get(Form, form_id)
    if form is None:
        raise NotFoundError("Form not found")
    return form


async def assert_project_owned(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> Project:
    """Return the project iff ``user_id`` owns it, else 404.

    We answer "not found" (never 403) for projects the caller doesn't own so the API
    doesn't disclose the existence of other users' projects.
    """
    project = await db.get(Project, project_id)
    if project is None or project.owner_id != user_id:
        raise NotFoundError("Project not found")
    return project


async def get_owned_form(db: AsyncSession, form_id: uuid.UUID, user_id: uuid.UUID) -> Form:
    """Fetch a form only if it lives in a project owned by ``user_id``, else 404.

    This is the per-object authorization gate for every owner-only form action
    (read draft, update, publish, list/export submissions). Forms the caller doesn't
    own are reported as not found so their existence is never revealed.
    """
    form = await get_form(db, form_id)
    project = await db.get(Project, form.project_id)
    if project is None or project.owner_id != user_id:
        raise NotFoundError("Form not found")
    return form


async def create_form(
    db: AsyncSession, project_id: uuid.UUID, content: FormSchema, owner_id: uuid.UUID
) -> Form:
    _assert_valid(content)
    await assert_project_owned(db, project_id, owner_id)
    form = Form(
        project_id=project_id,
        name=content.name,
        title=_plain(content.title),
        draft_content=content.model_dump(by_alias=True, mode="json"),
    )
    db.add(form)
    await db.flush()
    return form


async def update_draft(
    db: AsyncSession, form_id: uuid.UUID, content: FormSchema, user_id: uuid.UUID
) -> Form:
    _assert_valid(content)
    form = await get_owned_form(db, form_id, user_id)
    form.title = _plain(content.title)
    form.draft_content = content.model_dump(by_alias=True, mode="json")
    await db.flush()
    return form


async def publish_form(db: AsyncSession, form_id: uuid.UUID, user_id: uuid.UUID) -> FormVersion:
    """Freeze the current draft as the next immutable version."""
    form = await get_owned_form(db, form_id, user_id)
    content = FormSchema.model_validate(form.draft_content)
    _assert_valid(content)

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

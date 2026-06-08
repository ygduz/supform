"""Business logic for forms: validate, persist drafts, and publish immutable versions."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.form_engine import validate_form
from app.models.form import Form, FormVersion
from app.schemas.form_schema import FormSchema


async def get_form(db: AsyncSession, form_id: uuid.UUID) -> Form:
    form = await db.get(Form, form_id)
    if form is None:
        raise NotFoundError("Form not found")
    return form


async def create_form(db: AsyncSession, project_id: uuid.UUID, content: FormSchema) -> Form:
    _assert_valid(content)
    form = Form(
        project_id=project_id,
        name=content.name,
        title=_plain(content.title),
        draft_content=content.model_dump(by_alias=True, mode="json"),
    )
    db.add(form)
    await db.flush()
    return form


async def update_draft(db: AsyncSession, form_id: uuid.UUID, content: FormSchema) -> Form:
    _assert_valid(content)
    form = await get_form(db, form_id)
    form.title = _plain(content.title)
    form.draft_content = content.model_dump(by_alias=True, mode="json")
    await db.flush()
    return form


async def publish_form(db: AsyncSession, form_id: uuid.UUID) -> FormVersion:
    """Freeze the current draft as the next immutable version."""
    form = await get_form(db, form_id)
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

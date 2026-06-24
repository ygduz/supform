"""Form CRUD + publish endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.api import (
    FormAuditLogOut,
    FormCreate,
    FormDetail,
    FormListItem,
    FormOut,
    FormUpdate,
    FormVersionOut,
    PublishResult,
)
from app.schemas.form_schema import FormSchema
from app.services import forms as forms_service

router = APIRouter(prefix="/forms", tags=["forms"])


@router.get("", response_model=list[FormListItem])
async def list_forms(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FormListItem]:
    """Every form the caller can see (owned or shared), newest-edited first, with counts."""
    rows = await forms_service.list_forms(db, user.id)
    return [
        FormListItem.model_validate(form).model_copy(update={"response_count": count})
        for form, count in rows
    ]


@router.post("", response_model=FormOut, status_code=201)
async def create_form(
    payload: FormCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await forms_service.create_form(db, payload.project_id, payload.content, user.id)


@router.get("/{form_id}", response_model=FormDetail)
async def get_form(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await forms_service.get_owned_form(db, form_id, user.id)


@router.put("/{form_id}", response_model=FormOut)
async def update_form(
    form_id: uuid.UUID,
    payload: FormUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await forms_service.update_draft(db, form_id, payload.content, user.id)


@router.post("/{form_id}/duplicate", response_model=FormOut, status_code=201)
async def duplicate_form(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Clone the form's draft into the same project. Returns the new form. Editor+."""
    form = await forms_service.duplicate_form(db, form_id, user.id)
    await db.commit()
    return form


@router.delete("/{form_id}", status_code=204)
async def delete_form(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Permanently delete a form and its versions/submissions/webhooks/exports. Owner-only."""
    await forms_service.delete_form(db, form_id, user.id)
    await db.commit()


@router.post("/{form_id}/publish", response_model=PublishResult)
async def publish_form(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    version = await forms_service.publish_form(db, form_id, user.id)
    return PublishResult(form_id=form_id, version=version.version, respondent_url=f"/f/{form_id}")


@router.get("/{form_id}/schema", response_model=FormSchema)
async def get_published_schema(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Public: fetch the published schema so the renderer can display the form."""
    return await forms_service.get_published_schema(db, form_id)


@router.get("/{form_id}/versions", response_model=list[FormVersionOut])
async def list_form_versions(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all published versions of a form, newest first."""
    versions = await forms_service.list_form_versions(db, form_id, user.id)
    return [
        FormVersionOut(
            version=v.version,
            created_at=v.created_at,
            title=v.content.get("title") if isinstance(v.content.get("title"), str) else None,
        )
        for v in versions
    ]


@router.get("/{form_id}/versions/{version}", response_model=FormSchema)
async def get_form_version(
    form_id: uuid.UUID,
    version: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fetch the frozen schema for a specific published version."""
    from sqlalchemy import select as sa_select

    from app.models.form import FormVersion

    await forms_service.get_owned_form(db, form_id, user.id, min_role="viewer")
    from app.core.exceptions import NotFoundError

    stmt = sa_select(FormVersion).where(
        FormVersion.form_id == form_id, FormVersion.version == version
    )
    fv = (await db.execute(stmt)).scalar_one_or_none()
    if fv is None:
        raise NotFoundError("Version not found")
    return FormSchema.model_validate(fv.content)


@router.get("/{form_id}/audit", response_model=list[FormAuditLogOut])
async def get_form_audit(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the most recent audit log entries for a form (owner/editor/viewer)."""
    logs = await forms_service.list_form_audit(db, form_id, user.id)
    return [
        FormAuditLogOut(
            id=entry.id,
            action=entry.action,
            summary=entry.summary,
            created_at=entry.created_at,
        )
        for entry in logs
    ]

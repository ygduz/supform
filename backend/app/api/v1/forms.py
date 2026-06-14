"""Form CRUD + publish endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.api import (
    FormCreate,
    FormDetail,
    FormListItem,
    FormOut,
    FormUpdate,
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
    return PublishResult(form_id=form_id, version=version.version)


@router.get("/{form_id}/schema", response_model=FormSchema)
async def get_published_schema(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Public: fetch the published schema so the renderer can display the form."""
    return await forms_service.get_published_schema(db, form_id)

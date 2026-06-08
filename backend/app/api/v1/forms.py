"""Form CRUD + publish endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.api import FormCreate, FormDetail, FormOut, FormUpdate, PublishResult
from app.schemas.form_schema import FormSchema
from app.services import forms as forms_service

router = APIRouter(prefix="/forms", tags=["forms"])


@router.post("", response_model=FormOut, status_code=201)
async def create_form(
    payload: FormCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await forms_service.create_form(db, payload.project_id, payload.content)


@router.get("/{form_id}", response_model=FormDetail)
async def get_form(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await forms_service.get_form(db, form_id)


@router.put("/{form_id}", response_model=FormOut)
async def update_form(
    form_id: uuid.UUID,
    payload: FormUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await forms_service.update_draft(db, form_id, payload.content)


@router.post("/{form_id}/publish", response_model=PublishResult)
async def publish_form(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    version = await forms_service.publish_form(db, form_id)
    return PublishResult(form_id=form_id, version=version.version)


@router.get("/{form_id}/schema", response_model=FormSchema)
async def get_published_schema(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Public: fetch the published schema so the renderer can display the form."""
    return await forms_service.get_published_schema(db, form_id)

"""Question library — personal bank of reusable question definitions."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.session import get_db
from app.models.question_template import QuestionTemplate
from app.models.user import User

router = APIRouter(prefix="/question-library", tags=["question-library"])


class TemplateOut(BaseModel):
    id: uuid.UUID
    label: str
    element: dict[str, Any]

    model_config = {"from_attributes": True}


class TemplateCreate(BaseModel):
    label: str
    element: dict[str, Any]


@router.get("", response_model=list[TemplateOut])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TemplateOut]:
    stmt = (
        select(QuestionTemplate)
        .where(QuestionTemplate.owner_id == user.id)
        .order_by(QuestionTemplate.created_at.desc())
    )
    return [TemplateOut.model_validate(t) for t in await db.scalars(stmt)]


@router.post("", response_model=TemplateOut, status_code=201)
async def create_template(
    payload: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TemplateOut:
    template = QuestionTemplate(owner_id=user.id, label=payload.label, element=payload.element)
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return TemplateOut.model_validate(template)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    template = await db.get(QuestionTemplate, template_id)
    if template is None or template.owner_id != user.id:
        raise NotFoundError("Template not found")
    await db.delete(template)
    await db.commit()

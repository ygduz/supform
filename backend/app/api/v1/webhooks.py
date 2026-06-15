"""Manage a form's outbound webhooks. Editor access required (these touch data flow)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.api import WebhookCreate, WebhookDeliveryOut, WebhookOut, WebhookUpdate
from app.services import webhooks as webhooks_service
from app.services.forms import get_owned_form

router = APIRouter(prefix="/forms/{form_id}/webhooks", tags=["webhooks"])


@router.get("", response_model=list[WebhookOut])
async def list_webhooks(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[WebhookOut]:
    await get_owned_form(db, form_id, user.id, min_role="editor")
    return list(await webhooks_service.list_webhooks(db, form_id))


@router.post("", response_model=WebhookOut, status_code=201)
async def create_webhook(
    form_id: uuid.UUID,
    payload: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WebhookOut:
    await get_owned_form(db, form_id, user.id, min_role="editor")
    webhook = await webhooks_service.create_webhook(db, form_id, payload.url, event=payload.event)
    await db.commit()
    return webhook


@router.patch("/{webhook_id}", response_model=WebhookOut)
async def update_webhook(
    form_id: uuid.UUID,
    webhook_id: uuid.UUID,
    payload: WebhookUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WebhookOut:
    await get_owned_form(db, form_id, user.id, min_role="editor")
    webhook = await webhooks_service.update_webhook(
        db, form_id, webhook_id, url=payload.url, active=payload.active
    )
    await db.commit()
    return webhook


@router.delete("/{webhook_id}", status_code=204)
async def delete_webhook(
    form_id: uuid.UUID,
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await get_owned_form(db, form_id, user.id, min_role="editor")
    await webhooks_service.delete_webhook(db, form_id, webhook_id)
    await db.commit()


@router.get("/{webhook_id}/deliveries", response_model=list[WebhookDeliveryOut])
async def list_deliveries(
    form_id: uuid.UUID,
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[WebhookDeliveryOut]:
    await get_owned_form(db, form_id, user.id, min_role="editor")
    return list(await webhooks_service.list_deliveries(db, webhook_id))


@router.post("/{webhook_id}/test", response_model=WebhookDeliveryOut, status_code=201)
async def test_webhook(
    form_id: uuid.UUID,
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WebhookDeliveryOut:
    await get_owned_form(db, form_id, user.id, min_role="editor")
    delivery = await webhooks_service.test_delivery(db, form_id, webhook_id)
    await db.commit()
    return delivery

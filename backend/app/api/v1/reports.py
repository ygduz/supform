"""CRUD endpoints for saved report configurations."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.session import get_db
from app.models.report import Report
from app.models.user import User

router = APIRouter(tags=["reports"])


class ReportIn(BaseModel):
    name: str = "Untitled Report"
    widgets: list = []


class ReportOut(BaseModel):
    id: uuid.UUID
    form_id: uuid.UUID
    name: str
    widgets: list

    model_config = {"from_attributes": True}


@router.get("/forms/{form_id}/reports", response_model=list[ReportOut])
async def list_reports(
    form_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(select(Report).where(Report.form_id == form_id))
    return result.scalars().all()


@router.post("/forms/{form_id}/reports", response_model=ReportOut, status_code=201)
async def create_report(
    form_id: uuid.UUID,
    payload: ReportIn,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    report = Report(form_id=form_id, name=payload.name, widgets=payload.widgets)
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


@router.get("/forms/{form_id}/reports/{report_id}", response_model=ReportOut)
async def get_report(
    form_id: uuid.UUID,
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Report).where(Report.form_id == form_id, Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise NotFoundError("Report not found")
    return report


@router.patch("/forms/{form_id}/reports/{report_id}", response_model=ReportOut)
async def update_report(
    form_id: uuid.UUID,
    report_id: uuid.UUID,
    payload: ReportIn,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Report).where(Report.form_id == form_id, Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise NotFoundError("Report not found")
    report.name = payload.name
    report.widgets = payload.widgets
    await db.commit()
    await db.refresh(report)
    return report


@router.delete("/forms/{form_id}/reports/{report_id}", status_code=204)
async def delete_report(
    form_id: uuid.UUID,
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Report).where(Report.form_id == form_id, Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise NotFoundError("Report not found")
    await db.delete(report)
    await db.commit()

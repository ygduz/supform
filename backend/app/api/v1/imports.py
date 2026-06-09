"""Import endpoints — bring forms in from the ODK/XLSForm ecosystem.

``preview`` parses an uploaded XLSForm and returns the Supform schema (so the builder can
show it before saving); the create endpoint persists it as a draft form on a project.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.exceptions import ValidationError
from app.db.session import get_db
from app.importers import import_xlsform
from app.models.user import User
from app.schemas.api import FormOut
from app.schemas.form_schema import FormSchema
from app.services import forms as forms_service

router = APIRouter(prefix="/imports", tags=["imports"])


def _parse(data: bytes) -> FormSchema:
    try:
        return import_xlsform(data)
    except Exception as exc:  # noqa: BLE001 - surface any parse error as a clean 422
        raise ValidationError("Could not parse the XLSForm", details=str(exc)) from exc


@router.post("/xlsform/preview", response_model=FormSchema)
async def preview_xlsform(
    file: UploadFile = File(...),
    _: User = Depends(get_current_user),
) -> FormSchema:
    """Parse an uploaded XLSForm and return the resulting Supform schema (no persistence)."""
    return _parse(await file.read())


@router.post("/xlsform", response_model=FormOut, status_code=201)
async def import_xlsform_to_project(
    project_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Parse an uploaded XLSForm and create it as a draft form on the given project."""
    schema = _parse(await file.read())
    return await forms_service.create_form(db, project_id, schema, user.id)

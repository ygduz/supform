"""Request/response models for the REST API (distinct from the form-definition models)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.form_schema import FormSchema


# ---- auth ----
class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    full_name: str | None = None


# ---- projects ----
class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None = None
    created_at: datetime


# ---- forms ----
class FormCreate(BaseModel):
    project_id: uuid.UUID
    content: FormSchema


class FormUpdate(BaseModel):
    content: FormSchema


class FormOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    title: str
    status: str
    current_version: int | None = None
    created_at: datetime


class FormDetail(FormOut):
    draft_content: dict[str, Any]


class PublishResult(BaseModel):
    form_id: uuid.UUID
    version: int


# ---- submissions ----
class SubmissionCreate(BaseModel):
    answers: dict[str, Any]
    metadata: dict[str, Any] = Field(default_factory=dict)


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    form_id: uuid.UUID
    form_version: int
    answers: dict[str, Any]
    created_at: datetime

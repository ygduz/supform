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


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AIGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)


class EmailRequest(BaseModel):
    email: EmailStr


class TokenRequest(BaseModel):
    token: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8)


class MessageResponse(BaseModel):
    detail: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    full_name: str | None = None
    is_verified: bool = False


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


# ---- project members / sharing ----
class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: EmailStr
    full_name: str | None = None
    role: str


class MemberAdd(BaseModel):
    email: EmailStr
    role: str = "viewer"


class MemberUpdate(BaseModel):
    role: str


# ---- forms ----
class FormCreate(BaseModel):
    project_id: uuid.UUID
    content: FormSchema


class FormUpdate(BaseModel):
    content: FormSchema


class FormOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    title: str
    status: str
    current_version: int | None = None
    created_at: datetime


class FormListItem(FormOut):
    """Dashboard row: a form plus the stats the cards display."""

    updated_at: datetime
    response_count: int = 0


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
    validation_status: str | None = None
    score: float | None = None


class ValidationUpdate(BaseModel):
    # None clears the status back to unreviewed.
    status: str | None = None


class SubmissionAnswersUpdate(BaseModel):
    answers: dict[str, Any]


# ---- webhooks ----
class WebhookCreate(BaseModel):
    url: str
    event: str = "submission.created"


class WebhookUpdate(BaseModel):
    url: str | None = None
    active: bool | None = None


class WebhookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    form_id: uuid.UUID
    url: str
    event: str
    active: bool
    secret: str
    created_at: datetime


# ---- exports ----
class ExportJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    form_id: uuid.UUID
    format: str
    status: str
    filename: str | None = None
    error: str | None = None
    download_url: str | None = None


# ---- media ----
class MediaOut(BaseModel):
    """The reference a file field stores in its answer, returned after upload."""

    id: uuid.UUID
    filename: str
    content_type: str
    size: int
    url: str

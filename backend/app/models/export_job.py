from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ExportJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """An asynchronous export request. A Celery worker fills in the result.

    The generated file's bytes live in blob storage keyed by the job id; ``status`` tracks
    progress so the client can poll and then download.
    """

    __tablename__ = "export_jobs"

    form_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("forms.id"), index=True)
    requested_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    format: Mapped[str] = mapped_column(String(10), default="csv")
    # status: pending | running | done | failed
    status: Mapped[str] = mapped_column(String(20), default="pending")
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

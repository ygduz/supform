from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class MediaFile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Metadata for an uploaded file. The bytes live in blob storage keyed by ``id``.

    A media row belongs to the form it was uploaded against (used to authorize downloads)
    and is referenced from a submission's answers by id.
    """

    __tablename__ = "media_files"

    form_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("forms.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    respondent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Submission(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A single response to a form.

    ``answers`` is a JSONB object keyed by element ``name`` (matching the form schema).
    ``form_version`` records which schema version produced it.
    """

    __tablename__ = "submissions"

    form_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("forms.id"), index=True)
    form_version: Mapped[int] = mapped_column(Integer)
    answers: Mapped[dict] = mapped_column(JSONB, default=dict)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    # Optional respondent (None for anonymous public submissions).
    respondent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    source: Mapped[str] = mapped_column(String(30), default="web")  # web|api|import|offline

    form = relationship("Form", back_populates="submissions")

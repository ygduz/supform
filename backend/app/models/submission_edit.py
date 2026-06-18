from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UUIDPrimaryKeyMixin


class SubmissionEdit(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "submission_edits"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"), index=True
    )
    edited_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    answers_before: Mapped[dict] = mapped_column(JSONType)
    answers_after: Mapped[dict] = mapped_column(JSONType)
    changed_fields: Mapped[list] = mapped_column(JSONType)

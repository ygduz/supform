from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UUIDPrimaryKeyMixin


class QuestionTemplate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A saved question the user can reuse across forms.

    ``element`` stores the full Element JSON so it can be inserted verbatim into any
    form's page.elements list after the caller assigns a fresh ``name``.
    """

    __tablename__ = "question_templates"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    label: Mapped[str] = mapped_column(String(200))
    element: Mapped[dict] = mapped_column(JSONType)

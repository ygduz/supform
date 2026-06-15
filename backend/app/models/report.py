"""Saved report configurations per form."""
from __future__ import annotations
import uuid
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, JSONType, TimestampMixin, UUIDPrimaryKeyMixin


class Report(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "reports"
    form_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("forms.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200), default="Untitled Report")
    widgets: Mapped[list] = mapped_column(JSONType, default=list)

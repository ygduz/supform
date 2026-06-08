from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONType, TimestampMixin, UUIDPrimaryKeyMixin


class Form(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A form/survey. The editable draft definition lives in ``draft_content``;
    published, immutable snapshots live in :class:`FormVersion`.
    """

    __tablename__ = "forms"

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    title: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|published|archived

    # The live, editable Supform schema (JSONB). Conforms to packages/form-schema.
    draft_content: Mapped[dict] = mapped_column(JSONType, default=dict)

    # Points at the currently published version number (None until first publish).
    current_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    project = relationship("Project", back_populates="forms")
    versions: Mapped[list["FormVersion"]] = relationship(
        back_populates="form", cascade="all, delete-orphan", order_by="FormVersion.version"
    )
    submissions: Mapped[list["Submission"]] = relationship(  # noqa: F821
        back_populates="form", cascade="all, delete-orphan"
    )


class FormVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """An immutable published snapshot of a form's schema.

    Submissions reference the exact version they were made against, so historical data
    stays interpretable as the form evolves (same lesson KOBO's AssetVersion encodes).
    """

    __tablename__ = "form_versions"
    __table_args__ = (UniqueConstraint("form_id", "version", name="uq_form_version"),)

    form_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("forms.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[dict] = mapped_column(JSONType)  # frozen Supform schema

    form = relationship("Form", back_populates="versions")

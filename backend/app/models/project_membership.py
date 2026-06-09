from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ProjectMembership(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A collaborator's role on a project.

    The project's ``owner_id`` is the canonical owner and always has the implicit
    ``owner`` role; memberships add *extra* collaborators (``viewer``/``editor``).
    Forms inherit access from their project, so this is the single place team
    permissions are granted.
    """

    __tablename__ = "project_memberships"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_member_project_user"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20), default="viewer")

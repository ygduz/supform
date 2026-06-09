from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Webhook(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """An outbound HTTP endpoint notified when something happens to a form.

    For now the only event is ``submission.created``: when a response is accepted, each
    active webhook on the form receives a signed POST with the submission payload. The
    ``secret`` is used to sign deliveries (HMAC-SHA256) so receivers can verify origin.
    """

    __tablename__ = "webhooks"

    form_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("forms.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(2048))
    secret: Mapped[str] = mapped_column(String(64))
    event: Mapped[str] = mapped_column(String(50), default="submission.created")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

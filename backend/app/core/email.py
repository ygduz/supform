"""Outbound email — a thin, pluggable abstraction.

Like blob storage, *where* email goes is swappable behind one interface. The default
``console`` backend just logs the message (great for local dev — verification/reset links
appear in the server log). ``smtp`` sends for real via the stdlib. ``memory`` keeps an
in-process outbox the test suite asserts against. No third-party dependency required.
"""

from __future__ import annotations

import smtplib
from dataclasses import dataclass
from email.message import EmailMessage as _MIMEMessage
from typing import Protocol

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("email")


@dataclass
class EmailMessage:
    to: str
    subject: str
    body: str


class EmailSender(Protocol):
    def send(self, message: EmailMessage) -> None: ...


class ConsoleEmailSender:
    """Log the email instead of sending it. The default for development."""

    def send(self, message: EmailMessage) -> None:
        logger.info(
            "EMAIL (console backend)\n  To: %s\n  Subject: %s\n  %s",
            message.to,
            message.subject,
            message.body,
        )


class MemoryEmailSender:
    """Collect messages in a shared, inspectable outbox. Used by tests."""

    outbox: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        MemoryEmailSender.outbox.append(message)

    @classmethod
    def clear(cls) -> None:
        cls.outbox.clear()


class SMTPEmailSender:
    """Send via SMTP using the stdlib. Configured from ``settings.smtp_*``."""

    def send(self, message: EmailMessage) -> None:
        mime = _MIMEMessage()
        mime["From"] = settings.email_from
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime.set_content(message.body)

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(mime)


def get_email_sender() -> EmailSender:
    backend = settings.email_backend
    if backend == "smtp":
        return SMTPEmailSender()
    if backend == "memory":
        return MemoryEmailSender()
    return ConsoleEmailSender()


def send_email(to: str, subject: str, body: str) -> None:
    """Send (or log/capture) a plain-text email through the configured backend."""
    get_email_sender().send(EmailMessage(to=to, subject=subject, body=body))

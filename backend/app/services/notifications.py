"""Email notifications to form owners when a response arrives.

Mirrors the webhook dispatch: built after the submission commits, offloaded to Celery so a
slow mail server never blocks a respondent, and routed through the pluggable email backend
(``core/email.py``). The ``enqueue_notification`` seam lets tests stub the broker call.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.form import Form
from app.models.submission import Submission
from app.services.forms import get_published_schema


def build_notification(form: Form, submission: Submission, answers_summary: str) -> tuple[str, str]:
    subject = f"New response: {form.title or form.name}"
    body = (
        f"You received a new response to “{form.title or form.name}”.\n\n"
        f"{answers_summary}\n\n"
        f"View all responses: {{app}}/forms/{form.id}/responses"
    )
    return subject, body


def _summarize(answers: dict[str, Any]) -> str:
    lines = []
    for key, value in answers.items():
        if isinstance(value, (list, dict)):
            value = str(value)
        lines.append(f"- {key}: {value}")
    return "\n".join(lines) if lines else "(no answers)"


async def dispatch_submission_notification(
    db: AsyncSession, form: Form, submission: Submission
) -> None:
    """Email every address configured in the form's ``notifyEmails`` setting."""
    schema = await get_published_schema(db, form.id)
    emails = list(schema.settings.notify_emails or [])
    if not emails:
        return
    subject, body = build_notification(form, submission, _summarize(submission.answers))
    enqueue_notification(emails, subject, body)


def enqueue_notification(emails: list[str], subject: str, body: str) -> None:
    """Hand the notification to a Celery worker. Isolated so tests can stub the broker call."""
    from app.workers.tasks import send_notification

    send_notification.delay(emails, subject, body)

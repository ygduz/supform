"""Async tasks. Heavy/slow work runs here, off the request path.

These are scaffolded stubs; the real implementations land alongside their features (M3).
"""

from __future__ import annotations

from app.workers.celery_app import celery_app


@celery_app.task(name="exports.build")
def build_export(form_id: str, fmt: str = "csv") -> dict[str, str]:
    """Generate an export file for a form's submissions and return its storage location."""
    # TODO(M3): load submissions, call app.exporters, write to storage, return URL.
    return {"form_id": form_id, "format": fmt, "status": "not_implemented"}


@celery_app.task(name="imports.xlsform")
def import_xlsform_task(project_id: str, file_path: str) -> dict[str, str]:
    """Parse an uploaded XLSForm into a draft form."""
    # TODO(M3): call app.importers.import_xlsform and persist a draft Form.
    return {"project_id": project_id, "status": "not_implemented"}

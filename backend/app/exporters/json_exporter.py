"""JSON export — the lossless format (full nested answers preserved)."""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from app.schemas.form_schema import FormSchema


def export_json(form: FormSchema, submissions: Iterable[dict[str, Any]]) -> str:
    payload = {
        "form": {"name": form.name, "version": form.version},
        "submissions": list(submissions),
    }
    return json.dumps(payload, default=str, ensure_ascii=False, indent=2)

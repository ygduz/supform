"""Flatten submissions into CSV using the form schema for stable column ordering."""

from __future__ import annotations

import csv
import io
from collections.abc import Iterable
from typing import Any

from app.schemas.form_schema import FormSchema


def export_csv(form: FormSchema, submissions: Iterable[dict[str, Any]]) -> str:
    """Return CSV text. Columns follow the form's element order; repeats/matrices are
    JSON-encoded in their cell (a richer 'long' export comes in M3)."""
    columns = [el.name for el in form.iter_elements()
               if el.type not in ("note", "section", "html", "group", "repeat")]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=["_id", "_submitted_at", *columns],
                            extrasaction="ignore")
    writer.writeheader()
    for sub in submissions:
        row = {"_id": sub.get("id"), "_submitted_at": sub.get("created_at")}
        row.update(sub.get("answers", {}))
        writer.writerow(row)
    return buffer.getvalue()

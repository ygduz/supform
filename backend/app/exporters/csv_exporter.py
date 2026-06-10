"""CSV export — flat tabular view built on the shared :mod:`flatten` rules."""

from __future__ import annotations

import csv
import io
from collections.abc import Iterable
from typing import Any

from app.exporters.flatten import compute_columns, flatten_rows
from app.schemas.form_schema import FormSchema


def export_csv(form: FormSchema, submissions: Iterable[dict[str, Any]]) -> str:
    """Return CSV text. Column order and cell encoding come from :mod:`flatten`, so CSV and
    XLSX stay byte-for-byte consistent in their columns."""
    columns = compute_columns(form)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in flatten_rows(form, submissions):
        writer.writerow(row)
    return buffer.getvalue()

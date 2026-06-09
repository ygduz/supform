"""XLSX export — same flat layout as CSV, but as a styled spreadsheet via openpyxl."""

from __future__ import annotations

import io
from collections.abc import Iterable
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Font

from app.exporters.flatten import compute_columns, flatten_rows
from app.schemas.form_schema import FormSchema


def export_xlsx(form: FormSchema, submissions: Iterable[dict[str, Any]]) -> bytes:
    """Return XLSX bytes with a single ``Submissions`` sheet.

    WHY a bold, frozen header: spreadsheets are scrolled by humans, so a pinned header keeps
    column meaning visible. Shares :mod:`flatten` with CSV so both formats agree on columns.
    """
    columns = compute_columns(form)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Submissions"

    sheet.append(columns)
    bold = Font(bold=True)
    for cell in sheet[1]:
        cell.font = bold
    sheet.freeze_panes = "A2"  # keep the header row visible while scrolling

    for row in flatten_rows(form, submissions):
        sheet.append([row.get(col, "") for col in columns])

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()

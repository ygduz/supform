"""XLSX export — same flat layout as CSV, but as a styled spreadsheet via openpyxl."""

from __future__ import annotations

import io
from collections.abc import Iterable
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Font

from app.exporters.flatten import (
    compute_columns,
    compute_repeat_columns,
    flatten_repeat_rows,
    flatten_rows,
    repeat_elements,
)
from app.schemas.form_schema import FormSchema

_MAX_SHEET_NAME = 31  # Excel's hard limit on worksheet names


def _styled_sheet(
    workbook: Workbook, title: str, columns: list[str], rows: list[dict[str, str]]
) -> None:
    sheet = workbook.create_sheet(title=title[:_MAX_SHEET_NAME])
    sheet.append(columns)
    bold = Font(bold=True)
    for cell in sheet[1]:
        cell.font = bold
    sheet.freeze_panes = "A2"  # keep the header row visible while scrolling
    for row in rows:
        sheet.append([row.get(col, "") for col in columns])


def export_xlsx(form: FormSchema, submissions: Iterable[dict[str, Any]]) -> bytes:
    """Return XLSX bytes: a ``Submissions`` sheet plus one long-format sheet per repeat.

    WHY a bold, frozen header: spreadsheets are scrolled by humans, so a pinned header keeps
    column meaning visible. WHY extra sheets: a repeat holds many rows per response, so it
    can't fit one cell — each repeat gets its own sheet, one row per instance, linked to the
    parent by ``_parent_id`` (the 'long format' lesson Kobo's formpack encodes). Shares
    :mod:`flatten` with CSV so the main sheet agrees on columns.
    """
    # Materialize once: the main sheet and repeat flattening both consume the submissions.
    submissions = list(submissions)

    workbook = Workbook()
    workbook.remove(workbook.active)  # drop the default sheet; we name our own

    _styled_sheet(workbook, "Submissions", compute_columns(form), flatten_rows(form, submissions))

    repeat_rows = flatten_repeat_rows(form, submissions)
    used_names = {"Submissions"}
    for el in repeat_elements(form):
        base = (el.name or "repeat")[:_MAX_SHEET_NAME]
        name, suffix = base, 1
        while name in used_names:  # keep sheet names unique within Excel's limit
            name = f"{base[: _MAX_SHEET_NAME - 2]}_{suffix}"
            suffix += 1
        used_names.add(name)
        _styled_sheet(workbook, name, compute_repeat_columns(el), repeat_rows.get(el.name, []))

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()

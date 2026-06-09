"""Shared flattening logic for tabular exporters (CSV/XLSX).

WHY: CSV and XLSX must agree on column ordering and cell encoding, so the rules live here
once instead of being duplicated (and drifting) across exporters. The form schema drives
column order so output stays stable across submissions, even sparse ones.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from app.schemas.form_schema import Element, FormSchema

# Container/presentational types carry no answer data of their own.
_SKIP_TYPES = frozenset({"note", "section", "html", "group"})

# Leading meta columns, always present regardless of the form definition.
META_COLUMNS = ["_id", "_submitted_at"]


def _matrix_row_keys(el: Element) -> list[str]:
    """One column per matrix row, keyed ``{name}/{row_value}`` for a stable wide layout."""
    return [f"{el.name}/{row.value}" for row in (el.rows or [])]


def compute_columns(form: FormSchema) -> list[str]:
    """Return ordered output columns: meta columns first, then schema-driven field columns.

    Matrix fields expand to one column per row; every other (non-container) field is a single
    column keyed by its ``name``.
    """
    columns: list[str] = list(META_COLUMNS)
    for el in form.iter_elements():
        if el.type in _SKIP_TYPES:
            continue
        if el.type == "matrix":
            columns.extend(_matrix_row_keys(el))
        else:
            columns.append(el.name)
    return columns


def _format_value(el: Element, value: Any) -> Any:
    """Encode a single field's value for one cell, per the field type."""
    if value is None:
        return ""
    if el.type == "multi_choice" and isinstance(value, list):
        # Multiple selections collapse into one cell, human-readable and CSV-safe.
        return "; ".join(str(v) for v in value)
    if el.type == "repeat":
        # MVP: store the nested list as compact JSON in a single cell.
        # TODO: offer a "long format" export that emits one row per repeat instance.
        return json.dumps(value, default=str, ensure_ascii=False, separators=(",", ":"))
    return value


def flatten_rows(form: FormSchema, submissions: Iterable[dict[str, Any]]) -> list[dict[str, str]]:
    """Flatten submissions into row dicts keyed by :func:`compute_columns` column names.

    Matrix answers (``{row_value: col_value}``) are scattered across their per-row columns so
    each row's chosen column lands in the matching ``{name}/{row}`` cell.
    """
    elements = [el for el in form.iter_elements() if el.type not in _SKIP_TYPES]
    rows: list[dict[str, str]] = []
    for sub in submissions:
        answers = sub.get("answers") or {}
        row: dict[str, Any] = {
            "_id": sub.get("id"),
            "_submitted_at": sub.get("created_at"),
        }
        for el in elements:
            value = answers.get(el.name)
            if el.type == "matrix":
                row_answers = value if isinstance(value, dict) else {}
                for row_choice in el.rows or []:
                    key = f"{el.name}/{row_choice.value}"
                    chosen = row_answers.get(row_choice.value)
                    row[key] = "" if chosen is None else chosen
            else:
                row[el.name] = _format_value(el, value)
        rows.append({k: ("" if v is None else str(v)) for k, v in row.items()})
    return rows


__all__ = ["META_COLUMNS", "compute_columns", "flatten_rows"]

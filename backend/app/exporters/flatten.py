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


def _top_level_fields(form: FormSchema) -> list[Element]:
    """Answer-bearing fields for the main sheet: groups are transparent, but a ``repeat``
    is treated as a leaf (its instances go to a dedicated sheet, not as empty columns here).
    """
    out: list[Element] = []

    def _walk(elements: list[Element]) -> None:
        for el in elements:
            if el.type in _SKIP_TYPES:
                if el.type == "group" and el.elements:
                    _walk(el.elements)  # transparent scope
                continue
            out.append(el)  # includes repeat — but we don't descend into it

    for page in form.pages:
        _walk(page.elements)
    return out


def repeat_elements(form: FormSchema) -> list[Element]:
    """Every repeat element in the form (one extra sheet is produced per repeat)."""
    return [el for el in form.iter_elements() if el.type == "repeat"]


def compute_columns(form: FormSchema) -> list[str]:
    """Return ordered output columns: meta columns first, then schema-driven field columns.

    Matrix fields expand to one column per row; a repeat is a single JSON-summary column
    (its rows are exported long-format on a separate sheet); every other field is one column.
    Quiz forms add a leading ``_score`` column.
    """
    columns: list[str] = list(META_COLUMNS)
    if form.settings.quiz_mode:
        columns.append("_score")
    for el in _top_level_fields(form):
        if el.type == "matrix":
            columns.extend(_matrix_row_keys(el))
        else:
            columns.append(el.name)
    return columns


def compute_repeat_columns(el: Element) -> list[str]:
    """Columns for a repeat's long-format sheet: parent link + index, then child fields."""
    children = [c for c in (el.elements or []) if c.type not in _SKIP_TYPES]
    return ["_parent_id", "_index", *[c.name for c in children]]


def flatten_repeat_rows(
    form: FormSchema, submissions: Iterable[dict[str, Any]]
) -> dict[str, list[dict[str, str]]]:
    """One row per repeat instance, keyed by repeat name → rows (linked by ``_parent_id``)."""
    repeats = repeat_elements(form)
    result: dict[str, list[dict[str, str]]] = {el.name: [] for el in repeats}
    for sub in submissions:
        answers = sub.get("answers") or {}
        sub_id = sub.get("id")
        for el in repeats:
            instances = answers.get(el.name)
            if not isinstance(instances, list):
                continue
            children = [c for c in (el.elements or []) if c.type not in _SKIP_TYPES]
            for index, inst in enumerate(instances):
                inst = inst if isinstance(inst, dict) else {}
                row: dict[str, Any] = {"_parent_id": sub_id, "_index": index}
                for child in children:
                    row[child.name] = _format_value(child, inst.get(child.name))
                result[el.name].append({k: ("" if v is None else str(v)) for k, v in row.items()})
    return result


def _format_value(el: Element, value: Any) -> Any:
    """Encode a single field's value for one cell, per the field type."""
    if value is None:
        return ""
    if el.type == "multi_choice" and isinstance(value, list):
        # Multiple selections collapse into one cell, human-readable and CSV-safe.
        return "; ".join(str(v) for v in value)
    if el.type in ("file", "image") and isinstance(value, dict):
        # A file answer is a reference object; show its filename in the cell.
        return value.get("filename") or value.get("url") or ""
    if el.type == "repeat":
        # The CSV "main" sheet stores repeats as compact JSON; long-format repeat data
        # lives in the per-repeat sheets produced by xlsx_exporter (flatten_repeat_rows).
        return json.dumps(value, default=str, ensure_ascii=False, separators=(",", ":"))
    return value


def flatten_rows(form: FormSchema, submissions: Iterable[dict[str, Any]]) -> list[dict[str, str]]:
    """Flatten submissions into row dicts keyed by :func:`compute_columns` column names.

    Matrix answers (``{row_value: col_value}``) are scattered across their per-row columns so
    each row's chosen column lands in the matching ``{name}/{row}`` cell.
    """
    elements = _top_level_fields(form)
    rows: list[dict[str, str]] = []
    for sub in submissions:
        answers = sub.get("answers") or {}
        row: dict[str, Any] = {
            "_id": sub.get("id"),
            "_submitted_at": sub.get("created_at"),
        }
        if form.settings.quiz_mode:
            row["_score"] = (sub.get("metadata") or {}).get("_score", "")
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


__all__ = [
    "META_COLUMNS",
    "compute_columns",
    "compute_repeat_columns",
    "flatten_repeat_rows",
    "flatten_rows",
    "repeat_elements",
]

"""SPSS .sav export using pyreadstat (optional dependency).

Produces a binary SPSS system file that can be opened directly by SPSS Statistics,
PSPP, and R's ``haven`` / ``foreign`` packages.

Variable metadata:
- Variable labels come from the form schema (first-language label or field name).
- String fields are mapped to SPSS string type (width 255).
- Numeric fields (number/integer/decimal/rating/scale) are mapped to SPSS float.
- Date/datetime fields are mapped to SPSS date format strings.
- All other types (choice values, booleans, etc.) are serialised as strings.
"""

from __future__ import annotations

import json
import tempfile
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from app.exporters.flatten import _top_level_fields  # noqa: PLC2701
from app.schemas.form_schema import Element, FormSchema

try:
    import pyreadstat  # type: ignore[import]

    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False

_NUMERIC_TYPES = frozenset(["number", "integer", "decimal", "rating", "scale"])
_DATE_TYPES = frozenset(["date", "time", "datetime"])


def _label(el: Element) -> str:
    if el.label is None:
        return el.name
    if isinstance(el.label, str):
        return el.label
    # dict i18n label — take first available language
    return next(iter(el.label.values()), el.name)


def _to_spss_value(el: Element, value: Any) -> Any:
    if value is None:
        return None if el.type in _NUMERIC_TYPES else ""
    if el.type in _NUMERIC_TYPES:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    if el.type == "boolean":
        return 1.0 if value is True else (0.0 if value is False else None)
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str, ensure_ascii=False)
    return str(value)


def export_spss(form: FormSchema, submissions: Iterable[dict[str, Any]]) -> bytes:
    if not _AVAILABLE:
        raise RuntimeError(
            "pyreadstat is required for SPSS export. "
            "Install it with: pip install 'supform-backend[spss]'"
        )

    fields = _top_level_fields(form)
    # Always include _id and _submitted_at as string columns.
    meta_fields: list[tuple[str, str]] = [("_id", "_id"), ("_submitted_at", "_submitted_at")]
    data_fields = list(fields)

    col_names: list[str] = [m[0] for m in meta_fields] + [el.name for el in data_fields]
    var_labels: dict[str, str] = {el.name: _label(el) for el in data_fields}
    var_labels["_id"] = "Submission ID"
    var_labels["_submitted_at"] = "Submitted at"

    rows: list[dict[str, Any]] = []
    for sub in submissions:
        answers = sub.get("answers") or {}
        row: dict[str, Any] = {
            "_id": str(sub.get("id", "")),
            "_submitted_at": str(sub.get("created_at", "")),
        }
        for el in data_fields:
            row[el.name] = _to_spss_value(el, answers.get(el.name))
        rows.append(row)

    # pyreadstat writes to a file path; use a temp file and read it back.
    with tempfile.NamedTemporaryFile(suffix=".sav", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        empty: dict[str, list[Any]] = {col: [] for col in col_names}
        data = {col: [r[col] for r in rows] for col in col_names} if rows else empty
        pyreadstat.write_sav(
            data,
            tmp_path,
            column_labels=list(var_labels.get(c, c) for c in col_names),
        )
        return tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)

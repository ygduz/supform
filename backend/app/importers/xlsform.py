"""XLSForm  ->  Supform schema importer.

XLSForm (https://xlsform.org) is the spreadsheet standard KoboToolbox and ODK use. A
workbook has ``survey``, ``choices`` and ``settings`` sheets. This importer maps that grid
onto Supform's richer, nested JSON model.

Mapping highlights (full table in docs/form-schema.md):

    XLSForm type        -> Supform element type
    -----------------------------------------------
    text                -> text
    integer / decimal   -> integer / decimal
    select_one X        -> single_choice   (options from `choices` list X)
    select_multiple X   -> multi_choice
    note                -> note
    begin group / end   -> group (nested elements)
    begin repeat / end  -> repeat
    geopoint            -> geopoint
    image / audio       -> image / file
    calculate           -> calculated (relevant -> visibleIf, constraint -> validation)

NOTE: this is the scaffold/contract. The body is intentionally a stub to be implemented
in milestone M3. It documents the expected signature and mapping so callers can integrate
against it now.
"""

from __future__ import annotations

from pathlib import Path

from app.schemas.form_schema import FormSchema

# XLSForm question type -> Supform element type (the select_* ones are handled specially).
TYPE_MAP: dict[str, str] = {
    "text": "text",
    "integer": "integer",
    "decimal": "decimal",
    "note": "note",
    "date": "date",
    "time": "time",
    "dateTime": "datetime",
    "geopoint": "geopoint",
    "image": "image",
    "audio": "file",
    "video": "file",
    "barcode": "barcode",
    "calculate": "calculated",
    "range": "scale",
}


def import_xlsform(path: str | Path) -> FormSchema:  # pragma: no cover - stub
    """Parse an ``.xlsx``/``.xls`` XLSForm file into a :class:`FormSchema`.

    Implementation plan (M3):
      1. Read the ``survey``, ``choices``, ``settings`` sheets (openpyxl / pyxform).
      2. Walk ``survey`` rows, opening/closing ``group``/``repeat`` containers on
         ``begin group`` / ``begin repeat``.
      3. For ``select_one X`` / ``select_multiple X``, attach the matching ``choices``
         list as ``options``.
      4. Map ``relevant`` -> ``visibleIf``, ``constraint`` -> ``validation.expression``,
         ``calculation`` -> ``calculate`` (translating ODK XPath-ish syntax to our
         expression grammar).
    """
    raise NotImplementedError(
        "XLSForm import is scaffolded for milestone M3. See the docstring for the plan."
    )

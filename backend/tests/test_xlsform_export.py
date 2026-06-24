"""Tests for the XLSForm (ODK) exporter."""

from __future__ import annotations

import io

import openpyxl

from app.exporters.xlsform_exporter import export_xlsform
from app.schemas.form_schema import FormSchema


def _form(pages: list | None = None) -> FormSchema:
    return FormSchema.model_validate(
        {
            "name": "test_form",
            "title": "Test Form",
            "pages": pages
            or [
                {
                    "name": "p1",
                    "elements": [{"type": "text", "name": "full_name", "label": "Full name"}],
                }
            ],
        }
    )


def _load(data: bytes) -> dict[str, list[list[str]]]:
    """Load all sheets from the XLSX bytes into {sheet_name: [[row values]]}."""
    wb = openpyxl.load_workbook(io.BytesIO(data))
    return {
        ws.title: [[str(c.value or "") for c in row] for row in ws.iter_rows()]
        for ws in wb.worksheets
    }


def test_produces_three_sheets() -> None:
    data = export_xlsform(_form())
    sheets = _load(data)
    assert set(sheets) == {"survey", "choices", "settings"}


def test_survey_header_has_type_and_name() -> None:
    data = export_xlsform(_form())
    header = _load(data)["survey"][0]
    assert "type" in header
    assert "name" in header


def test_text_field_exported() -> None:
    data = export_xlsform(_form())
    survey = _load(data)["survey"]
    header = survey[0]
    rows = {r[header.index("name")]: r for r in survey[1:]}
    assert "full_name" in rows
    assert rows["full_name"][header.index("type")] == "text"


def test_required_field() -> None:
    form = _form([{"name": "p1", "elements": [{"type": "text", "name": "q", "required": True}]}])
    data = export_xlsform(form)
    survey = _load(data)["survey"]
    header = survey[0]
    rows = {r[header.index("name")]: r for r in survey[1:]}
    assert rows["q"][header.index("required")] == "yes"


def test_single_choice_with_options() -> None:
    form = _form(
        [
            {
                "name": "p1",
                "elements": [
                    {
                        "type": "single_choice",
                        "name": "color",
                        "label": "Colour",
                        "options": [
                            {"value": "red", "label": "Red"},
                            {"value": "blue", "label": "Blue"},
                        ],
                    }
                ],
            }
        ]
    )
    data = export_xlsform(form)
    sheets = _load(data)
    survey = sheets["survey"]
    header = survey[0]
    rows = {r[header.index("name")]: r for r in survey[1:]}
    assert rows["color"][header.index("type")].startswith("select_one")

    choices = sheets["choices"]
    ch = choices[0]
    choice_names = [r[ch.index("name")] for r in choices[1:]]
    assert "red" in choice_names
    assert "blue" in choice_names


def test_multi_choice() -> None:
    form = _form(
        [
            {
                "name": "p1",
                "elements": [
                    {
                        "type": "multi_choice",
                        "name": "langs",
                        "options": [{"value": "en"}, {"value": "fr"}],
                    }
                ],
            }
        ]
    )
    data = export_xlsform(form)
    survey = _load(data)["survey"]
    header = survey[0]
    rows = {r[header.index("name")]: r for r in survey[1:]}
    assert rows["langs"][header.index("type")].startswith("select_multiple")


def test_group_produces_begin_end() -> None:
    form = _form(
        [
            {
                "name": "p1",
                "elements": [
                    {
                        "type": "group",
                        "name": "grp",
                        "label": "Group",
                        "elements": [{"type": "text", "name": "inner"}],
                    }
                ],
            }
        ]
    )
    data = export_xlsform(form)
    survey = _load(data)["survey"]
    header = survey[0]
    types = [r[header.index("type")] for r in survey[1:]]
    assert "begin_group" in types
    assert "end_group" in types


def test_visible_if_becomes_relevant() -> None:
    form = _form(
        [
            {
                "name": "p1",
                "elements": [
                    {"type": "text", "name": "age"},
                    {
                        "type": "text",
                        "name": "drink",
                        "visibleIf": "age >= 18",
                    },
                ],
            }
        ]
    )
    data = export_xlsform(form)
    survey = _load(data)["survey"]
    header = survey[0]
    rows = {r[header.index("name")]: r for r in survey[1:]}
    relevant = rows["drink"][header.index("relevant")]
    assert "${age}" in relevant


def test_settings_sheet() -> None:
    form = _form()
    data = export_xlsform(form)
    settings = _load(data)["settings"]
    assert settings[0][0] == "form_title"
    assert settings[1][0] == "Test Form"
    assert settings[1][1] == "test_form"


def test_boolean_maps_to_acknowledge() -> None:
    form = _form([{"name": "p1", "elements": [{"type": "boolean", "name": "consent"}]}])
    data = export_xlsform(form)
    survey = _load(data)["survey"]
    header = survey[0]
    rows = {r[header.index("name")]: r for r in survey[1:]}
    assert rows["consent"][header.index("type")] == "acknowledge"


def test_empty_submissions_accepted() -> None:
    """export_xlsform accepts an empty submissions iterable (schema-only export)."""
    form = _form()
    data = export_xlsform(form, [])
    assert len(data) > 0

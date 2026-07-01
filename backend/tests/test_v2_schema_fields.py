"""Round-trip tests for the builder-v2 schema additions: rating/scale/matrix authoring
extras (Element) and autoNumber (FormSettings). All are additive fields on already-open
models — this just locks in the wire names (camelCase alias) and Python access (snake_case).
"""

from __future__ import annotations

from app.schemas.form_schema import Element, FormSchema


def test_rating_extras_round_trip():
    el = Element.model_validate(
        {
            "type": "rating",
            "name": "satisfaction",
            "ratingMax": 7,
            "ratingGlyph": "number",
        }
    )
    assert el.rating_max == 7
    assert el.rating_glyph == "number"
    assert el.model_dump(by_alias=True, exclude_none=True)["ratingMax"] == 7
    assert el.model_dump(by_alias=True, exclude_none=True)["ratingGlyph"] == "number"


def test_scale_label_extras_round_trip():
    el = Element.model_validate(
        {
            "type": "scale",
            "name": "nps",
            "scaleLabelLow": "Not likely",
            "scaleLabelHigh": "Very likely",
            "validation": {"min": 0, "max": 10},
        }
    )
    assert el.scale_label_low == "Not likely"
    assert el.scale_label_high == "Very likely"
    assert el.validation.min == 0
    assert el.validation.max == 10
    dumped = el.model_dump(by_alias=True, exclude_none=True)
    assert dumped["scaleLabelLow"] == "Not likely"
    assert dumped["scaleLabelHigh"] == "Very likely"


def test_matrix_multi_round_trip():
    el = Element.model_validate(
        {
            "type": "matrix",
            "name": "prefs",
            "rows": [{"value": "a"}],
            "columns": [{"value": "b"}],
            "matrixMulti": True,
        }
    )
    assert el.matrix_multi is True
    assert el.model_dump(by_alias=True, exclude_none=True)["matrixMulti"] is True


def test_v2_element_extras_default_to_none():
    el = Element.model_validate({"type": "rating", "name": "q"})
    assert el.rating_max is None
    assert el.rating_glyph is None
    assert el.scale_label_low is None
    assert el.matrix_multi is None
    # None fields are excluded from the wire payload (exclude_none), so old clients never
    # see keys they don't understand.
    assert "ratingMax" not in el.model_dump(by_alias=True, exclude_none=True)


def test_auto_number_defaults_true_and_is_settable():
    form = FormSchema.model_validate(
        {"name": "f", "title": "F", "pages": [{"name": "p1", "elements": []}]}
    )
    assert form.settings.auto_number is True

    form2 = FormSchema.model_validate(
        {
            "name": "f",
            "title": "F",
            "settings": {"autoNumber": False},
            "pages": [{"name": "p1", "elements": []}],
        }
    )
    assert form2.settings.auto_number is False
    assert form2.settings.model_dump(by_alias=True)["autoNumber"] is False


def test_unknown_element_extras_still_pass_through_extra_allow():
    # Element.model_config has extra="allow" — an SDK/API client sending a field this
    # backend version doesn't know about yet must not be rejected.
    el = Element.model_validate({"type": "text", "name": "q", "somethingFuture": 1})
    assert el.model_extra["somethingFuture"] == 1

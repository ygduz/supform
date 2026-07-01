from supform_sdk import Form, fields


def test_build_produces_valid_shape():
    form = Form("survey", title="Survey")
    form.add(
        fields.Text("name", label="Name", required=True),
        fields.SingleChoice("color", label="Color", options=["Red", "Blue"]),
    )
    data = form.to_dict()

    assert data["name"] == "survey"
    assert data["pages"][0]["elements"][0] == {
        "type": "text", "name": "name", "label": "Name", "required": True
    }
    color = data["pages"][0]["elements"][1]
    assert color["type"] == "single_choice"
    assert color["options"] == [
        {"value": "Red", "label": "Red"}, {"value": "Blue", "label": "Blue"}
    ]


def test_visible_if_passthrough():
    el = fields.Integer("age", label="Age", visible_if="x == 1", min=0)
    assert el["visibleIf"] == "x == 1"
    assert el["validation"] == {"min": 0}


def test_rating_glyph_and_max():
    el = fields.Rating("satisfaction", scale=7, rating_glyph="number")
    assert el["ratingMax"] == 7
    assert el["ratingGlyph"] == "number"
    assert len(el["options"]) == 7


def test_rating_defaults_have_no_glyph_key():
    el = fields.Rating("satisfaction")
    assert el["ratingMax"] == 5
    assert "ratingGlyph" not in el


def test_scale_labels_and_bounds():
    el = fields.Scale("nps", min=0, max=10, scale_label_low="Not likely", scale_label_high="Very likely")
    assert el["scaleLabelLow"] == "Not likely"
    assert el["scaleLabelHigh"] == "Very likely"
    assert el["validation"] == {"min": 0, "max": 10}


def test_matrix_multi():
    el = fields.Matrix(
        "prefs",
        rows=["Row A", "Row B"],
        columns=["Col 1", "Col 2"],
        matrix_multi=True,
    )
    assert el["matrixMulti"] is True
    assert el["type"] == "matrix"


def test_matrix_multi_omitted_when_not_set():
    el = fields.Matrix("prefs", rows=["A"], columns=["B"])
    assert "matrixMulti" not in el


def test_form_settings_accepts_auto_number():
    form = Form("survey", title="Survey")
    form.settings(autoNumber=False)
    assert form.to_dict()["settings"]["autoNumber"] is False

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

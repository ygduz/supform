"""Advanced submission validation tests: repeats, matrix, multi-choice, groups.

These exercise the recursive machinery in form_engine/submissions.py that the basic
test_form_engine.py does not cover.
"""

from __future__ import annotations

from app.form_engine import validate_submission
from app.schemas.form_schema import FormSchema

# ------------------------------------------------------------------ helpers


def _form(elements: list[dict]) -> FormSchema:
    return FormSchema.model_validate(
        {"name": "f", "title": "F", "pages": [{"name": "p1", "elements": elements}]}
    )


# ------------------------------------------------------------------ multi_choice


def test_multi_choice_valid() -> None:
    form = _form(
        [
            {
                "type": "multi_choice",
                "name": "langs",
                "options": [{"value": "py"}, {"value": "go"}, {"value": "js"}],
            }
        ]
    )
    result = validate_submission(form, {"langs": ["py", "go"]})
    assert result.is_valid


def test_multi_choice_invalid_option() -> None:
    form = _form(
        [
            {
                "type": "multi_choice",
                "name": "langs",
                "options": [{"value": "py"}, {"value": "go"}],
            }
        ]
    )
    result = validate_submission(form, {"langs": ["py", "rust"]})
    assert not result.is_valid
    assert "langs" in result.errors


def test_multi_choice_min_selected() -> None:
    form = _form(
        [
            {
                "type": "multi_choice",
                "name": "tags",
                "options": [{"value": "a"}, {"value": "b"}, {"value": "c"}],
                "validation": {"min_selected": 2},
            }
        ]
    )
    result = validate_submission(form, {"tags": ["a"]})
    assert not result.is_valid
    assert "tags" in result.errors


def test_multi_choice_max_selected() -> None:
    form = _form(
        [
            {
                "type": "multi_choice",
                "name": "tags",
                "options": [{"value": "a"}, {"value": "b"}, {"value": "c"}],
                "validation": {"max_selected": 2},
            }
        ]
    )
    result = validate_submission(form, {"tags": ["a", "b", "c"]})
    assert not result.is_valid
    assert "tags" in result.errors


def test_multi_choice_not_a_list() -> None:
    form = _form([{"type": "multi_choice", "name": "x", "options": [{"value": "a"}]}])
    result = validate_submission(form, {"x": "a"})
    assert not result.is_valid


# ------------------------------------------------------------------ matrix


def test_matrix_valid() -> None:
    form = _form(
        [
            {
                "type": "matrix",
                "name": "rate",
                "rows": [{"value": "speed"}, {"value": "ease"}],
                "columns": [{"value": "low"}, {"value": "high"}],
            }
        ]
    )
    result = validate_submission(form, {"rate": {"speed": "high", "ease": "low"}})
    assert result.is_valid


def test_matrix_unknown_row() -> None:
    form = _form(
        [
            {
                "type": "matrix",
                "name": "rate",
                "rows": [{"value": "speed"}],
                "columns": [{"value": "low"}, {"value": "high"}],
            }
        ]
    )
    result = validate_submission(form, {"rate": {"unknown_row": "high"}})
    assert not result.is_valid
    assert "rate" in result.errors


def test_matrix_invalid_column() -> None:
    form = _form(
        [
            {
                "type": "matrix",
                "name": "rate",
                "rows": [{"value": "speed"}],
                "columns": [{"value": "low"}, {"value": "high"}],
            }
        ]
    )
    result = validate_submission(form, {"rate": {"speed": "medium"}})
    assert not result.is_valid


def test_matrix_required_all_rows() -> None:
    form = _form(
        [
            {
                "type": "matrix",
                "name": "rate",
                "required": True,
                "rows": [{"value": "speed"}, {"value": "ease"}],
                "columns": [{"value": "low"}, {"value": "high"}],
            }
        ]
    )
    # Only one row answered — should fail
    result = validate_submission(form, {"rate": {"speed": "high"}})
    assert not result.is_valid
    assert "rate" in result.errors


def test_matrix_not_a_dict() -> None:
    form = _form(
        [
            {
                "type": "matrix",
                "name": "rate",
                "rows": [{"value": "r"}],
                "columns": [{"value": "c"}],
            }
        ]
    )
    result = validate_submission(form, {"rate": "not-a-dict"})
    assert not result.is_valid


# ------------------------------------------------------------------ groups (transparent scope)


def test_group_children_validated_inline() -> None:
    """Fields inside a group share the same answer scope — no nesting in answers."""
    form = _form(
        [
            {
                "type": "group",
                "name": "personal",
                "elements": [
                    {"type": "text", "name": "first_name", "required": True},
                    {"type": "text", "name": "last_name", "required": True},
                ],
            }
        ]
    )
    result = validate_submission(form, {"first_name": "Ada"})
    assert not result.is_valid
    assert "last_name" in result.errors


def test_group_visible_if_hides_children() -> None:
    form = _form(
        [
            {
                "type": "group",
                "name": "extra",
                "visibleIf": "show_extra == true",
                "elements": [
                    {"type": "text", "name": "detail", "required": True},
                ],
            },
            {"type": "boolean", "name": "show_extra"},
        ]
    )
    # group hidden — detail not required
    result = validate_submission(form, {"show_extra": False})
    assert result.is_valid
    assert "detail" not in result.cleaned


# ------------------------------------------------------------------ repeats


def test_repeat_valid_instances() -> None:
    form = _form(
        [
            {
                "type": "repeat",
                "name": "members",
                "elements": [{"type": "text", "name": "member_name", "required": True}],
            }
        ]
    )
    instances = [{"member_name": "Alice"}, {"member_name": "Bob"}]
    result = validate_submission(form, {"members": instances})
    assert result.is_valid
    assert len(result.cleaned["members"]) == 2


def test_repeat_empty_allowed_when_not_required() -> None:
    form = _form(
        [
            {
                "type": "repeat",
                "name": "items",
                "elements": [{"type": "text", "name": "item"}],
            }
        ]
    )
    result = validate_submission(form, {"items": []})
    assert result.is_valid


def test_repeat_min_count_enforced() -> None:
    form = _form(
        [
            {
                "type": "repeat",
                "name": "members",
                "repeat": {"min": 2},
                "elements": [{"type": "text", "name": "n"}],
            }
        ]
    )
    result = validate_submission(form, {"members": [{"n": "A"}]})
    assert not result.is_valid
    assert "members" in result.errors


def test_repeat_max_count_enforced() -> None:
    form = _form(
        [
            {
                "type": "repeat",
                "name": "items",
                "repeat": {"min": 0, "max": 2},
                "elements": [{"type": "text", "name": "n"}],
            }
        ]
    )
    result = validate_submission(form, {"items": [{"n": "a"}, {"n": "b"}, {"n": "c"}]})
    assert not result.is_valid
    assert "items" in result.errors


def test_repeat_per_instance_validation() -> None:
    """Each instance is validated independently; errors are path-prefixed."""
    form = _form(
        [
            {
                "type": "repeat",
                "name": "people",
                "elements": [{"type": "text", "name": "email", "required": True}],
            }
        ]
    )
    result = validate_submission(form, {"people": [{"email": "a@b.c"}, {}]})
    assert not result.is_valid
    # error key includes the instance index
    assert any("people[1]" in k for k in result.errors)


def test_repeat_required_empty() -> None:
    form = _form(
        [
            {
                "type": "repeat",
                "name": "lines",
                "required": True,
                "elements": [{"type": "text", "name": "t"}],
            }
        ]
    )
    result = validate_submission(form, {})
    assert not result.is_valid
    assert "lines" in result.errors


def test_repeat_not_a_list() -> None:
    form = _form(
        [
            {
                "type": "repeat",
                "name": "items",
                "elements": [{"type": "text", "name": "t"}],
            }
        ]
    )
    result = validate_submission(form, {"items": "not-a-list"})
    assert not result.is_valid
    assert "items" in result.errors


# ------------------------------------------------------------------ calculated fields


def test_calculated_field_server_computed() -> None:
    form = _form(
        [
            {"type": "integer", "name": "a"},
            {"type": "integer", "name": "b"},
            {"type": "calculated", "name": "total", "calculate": "a + b"},
        ]
    )
    result = validate_submission(form, {"a": 3, "b": 4, "total": 999})
    assert result.is_valid
    # server overwrites client-submitted value
    assert result.cleaned["total"] == 7


def test_calculated_field_bad_expression_does_not_crash() -> None:
    form = _form([{"type": "calculated", "name": "x", "calculate": "undefined_var ** 2"}])
    result = validate_submission(form, {})
    assert result.is_valid  # bad calc silently skipped — must not 500


# ------------------------------------------------------------------ geopoint


def test_geopoint_accepts_valid_location() -> None:
    form = _form([{"type": "geopoint", "name": "where"}])
    result = validate_submission(form, {"where": {"lat": 51.5, "lng": -0.12, "accuracy": 8}})
    assert result.is_valid


def test_geopoint_rejects_bad_shape_and_out_of_range() -> None:
    form = _form([{"type": "geopoint", "name": "where"}])
    assert not validate_submission(form, {"where": "51,-0.1"}).is_valid
    assert not validate_submission(form, {"where": {"lat": 200, "lng": 0}}).is_valid
    assert not validate_submission(form, {"where": {"lat": "x", "lng": 0}}).is_valid


def test_geopoint_optional_when_empty() -> None:
    form = _form([{"type": "geopoint", "name": "where"}])
    assert validate_submission(form, {}).is_valid


# ------------------------------------------------------------------ hidden fields


def test_hidden_field_value_passes_through_unvalidated() -> None:
    form = _form([{"type": "hidden", "name": "utm_source", "required": True}])
    # Even marked required, a hidden field never blocks submission; its value is kept.
    result = validate_submission(form, {"utm_source": "newsletter"})
    assert result.is_valid
    assert result.cleaned["utm_source"] == "newsletter"
    # And it's fine when absent.
    assert validate_submission(form, {}).is_valid

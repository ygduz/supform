"""Tests for schema validation and submission validation."""

from app.form_engine import validate_form, validate_submission
from app.schemas.form_schema import FormSchema

CONTACT = {
    "name": "contact",
    "title": "Contact",
    "pages": [
        {
            "name": "p1",
            "elements": [
                {"type": "text", "name": "full_name", "label": "Name", "required": True},
                {"type": "email", "name": "email", "label": "Email", "required": True},
                {
                    "type": "integer",
                    "name": "age",
                    "label": "Age",
                    "validation": {"min": 0, "max": 120},
                },
                {
                    "type": "single_choice",
                    "name": "is_adult_topic",
                    "label": "Adult topic?",
                    "options": [{"value": "yes"}, {"value": "no"}],
                    "visibleIf": "age >= 18",
                },
            ],
        }
    ],
}


def _form() -> FormSchema:
    return FormSchema.model_validate(CONTACT)


def test_valid_form_has_no_issues():
    assert validate_form(_form()) == []


def test_duplicate_names_flagged():
    data = {**CONTACT, "pages": [{"name": "p", "elements": [
        {"type": "text", "name": "x"}, {"type": "text", "name": "x"},
    ]}]}
    issues = validate_form(FormSchema.model_validate(data))
    assert any("Duplicate" in i.message for i in issues)


def test_choice_without_options_flagged():
    data = {**CONTACT, "pages": [{"name": "p", "elements": [
        {"type": "single_choice", "name": "c", "label": "C"},
    ]}]}
    issues = validate_form(FormSchema.model_validate(data))
    assert any("needs options" in i.message for i in issues)


def test_required_fields_enforced():
    result = validate_submission(_form(), {"age": 10})
    assert not result.is_valid
    assert "full_name" in result.errors and "email" in result.errors


def test_hidden_field_not_required_and_dropped():
    # age < 18 hides is_adult_topic -> not required, and stripped from cleaned data.
    result = validate_submission(_form(), {"full_name": "A", "email": "a@b.c", "age": 10})
    assert result.is_valid
    assert "is_adult_topic" not in result.cleaned


def test_numeric_range_validation():
    result = validate_submission(_form(), {"full_name": "A", "email": "a@b.c", "age": 200})
    assert not result.is_valid
    assert "age" in result.errors

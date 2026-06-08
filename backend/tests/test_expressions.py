"""Tests for the safe expression evaluator."""

import pytest

from app.form_engine.expressions import ExpressionError, evaluate, evaluate_bool


def test_arithmetic_and_comparison():
    assert evaluate("age >= 18", {"age": 20}) is True
    assert evaluate("a + b * 2", {"a": 1, "b": 3}) == 7


def test_logical_and_membership():
    ctx = {"region": "north", "age": 30}
    assert evaluate("age >= 18 and region == 'north'", ctx) is True
    assert evaluate("region in ['north', 'south']", ctx) is True


def test_selected_helper_for_multichoice():
    assert evaluate("selected(langs, 'fr')", {"langs": ["en", "fr"]}) is True
    assert evaluate("selected(langs, 'de')", {"langs": ["en", "fr"]}) is False


def test_missing_field_is_none():
    assert evaluate("missing == None", {}) is True


def test_empty_expression_defaults_true():
    assert evaluate_bool(None, {}) is True
    assert evaluate_bool("", {}, default=False) is False


def test_disallowed_syntax_raises():
    with pytest.raises(ExpressionError):
        evaluate("__import__('os')", {})

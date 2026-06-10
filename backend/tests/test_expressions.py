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


def test_small_exponent_is_allowed():
    assert evaluate("2 ** 8", {}) == 256


def test_huge_exponent_is_rejected():
    # Guard against a CPU/memory DoS on the public submit path.
    with pytest.raises(ExpressionError):
        evaluate("2 ** 999999999", {})


def test_numeric_multiplication_still_works():
    assert evaluate("qty * 3", {"qty": 4}) == 12


def test_huge_sequence_repetition_is_rejected():
    # ``'a' * n`` / ``[x] * n`` repeats the sequence — cap it like the exponent guard.
    with pytest.raises(ExpressionError):
        evaluate("'a' * 999999999", {})
    with pytest.raises(ExpressionError):
        evaluate("[0] * 999999999", {})
    # Order shouldn't matter (count on either side).
    with pytest.raises(ExpressionError):
        evaluate("999999999 * 'a'", {})


def test_small_repetition_is_allowed():
    assert evaluate("'ab' * 3", {}) == "ababab"


def test_relevance_fails_safe_on_evaluation_error():
    # A relevance expression that errors at runtime (e.g. None >= 18 for an unanswered
    # field) must fall back to the default instead of raising (which would 500 a submit).
    assert evaluate_bool("age >= 18", {"age": None}, default=True) is True
    assert evaluate_bool("age >= 18", {"age": None}, default=False) is False
    # Division by zero similarly fails safe rather than crashing.
    assert evaluate_bool("1 / x > 0", {"x": 0}, default=False) is False


def test_relevance_repetition_dos_does_not_crash_submission():
    # The DoS guard raises ExpressionError, which evaluate_bool swallows to the default.
    assert evaluate_bool("count('a' * 999999999) > 0", {}, default=False) is False

"""Excel-style function catalog — backend half of the parity suite.

Every case here is mirrored 1:1 in ``frontend/src/features/renderer/functions.test.ts``
so the client live-preview evaluator and the server authoritative evaluator can never
diverge. When you add or change a function, update both files together.
"""

from __future__ import annotations

import math

import pytest

from app.form_engine.expressions import ExpressionError, evaluate, evaluate_bool

# (expression, context, expected) — the shared parity table.
CASES: list[tuple[str, dict, object]] = [
    # logical (lazy / short-circuit)
    ('IF(age >= 18, "adult", "minor")', {"age": 20}, "adult"),
    ('IF(age >= 18, "adult", "minor")', {"age": 5}, "minor"),
    ("IF(flag, 1, 2)", {"flag": None}, 2),  # blank is falsy
    ('IFS(score > 90, "A", score > 80, "B", True, "C")', {"score": 85}, "B"),
    ("AND(a > 0, b > 0)", {"a": 1, "b": 2}, True),
    ("AND(a > 0, b > 0)", {"a": 1, "b": -1}, False),
    ("OR(a > 0, b > 0)", {"a": -1, "b": 2}, True),
    ("NOT(a > 0)", {"a": -1}, True),
    ('SWITCH(grade, "A", 4, "B", 3, 0)', {"grade": "B"}, 3),
    ('SWITCH(grade, "A", 4, "B", 3, 0)', {"grade": "Z"}, 0),
    ("IFERROR(1 / x, -1)", {"x": 0}, -1),  # division by zero caught
    ("IFERROR(10 / x, -1)", {"x": 2}, 5.0),
    # aggregate (blanks ignored, Excel-style)
    ("SUM(a, b, c)", {"a": 1, "b": 2, "c": 3}, 6.0),
    ("SUM(a, b, c)", {"a": 1, "c": 3}, 4.0),  # missing b -> skipped
    ("AVERAGE(a, b, c)", {"a": 2, "b": 4, "c": 6}, 4.0),
    ("MIN(a, b, c)", {"a": 5, "b": 2, "c": 9}, 2.0),
    ("MAX(a, b, c)", {"a": 5, "b": 2, "c": 9}, 9.0),
    ("COUNT(a, b, c)", {"a": 1, "c": 3}, 2),  # counts numbers only
    ("COUNTA(a, b, c)", {"a": "x", "b": "", "c": 0}, 2),  # non-blank
    # math
    ("ROUND(x, 2)", {"x": 1.23456}, 1.23),
    ("ROUND(x, 0)", {"x": 2.5}, 3.0),  # half away from zero (not banker's)
    ("ROUNDUP(x, 0)", {"x": 2.1}, 3.0),
    ("ROUNDDOWN(x, 0)", {"x": 2.9}, 2.0),
    ("FLOOR(x, 5)", {"x": 13}, 10.0),
    ("CEILING(x, 5)", {"x": 11}, 15.0),
    ("MOD(a, b)", {"a": 7, "b": 3}, 1.0),
    ("ABS(x)", {"x": -4}, 4.0),
    ("POWER(b, e)", {"b": 2, "e": 10}, 1024.0),
    ("SQRT(x)", {"x": 16}, 4.0),
    ("INT(x)", {"x": 3.9}, 3),
    # text
    ('CONCAT(first, " ", last)', {"first": "Ada", "last": "Lovelace"}, "Ada Lovelace"),
    ("LEFT(s, 3)", {"s": "hello"}, "hel"),
    ("RIGHT(s, 2)", {"s": "hello"}, "lo"),
    ("MID(s, 2, 3)", {"s": "hello"}, "ell"),
    ("LEN(s)", {"s": "hello"}, 5),
    ("UPPER(s)", {"s": "abc"}, "ABC"),
    ("LOWER(s)", {"s": "ABC"}, "abc"),
    ("TRIM(s)", {"s": "  hi  "}, "hi"),
    ('SUBSTITUTE(s, "a", "o")', {"s": "banana"}, "bonono"),
    ("VALUE(s)", {"s": "42"}, 42.0),
    # info
    ("ISBLANK(x)", {"x": None}, True),
    ("ISBLANK(x)", {"x": 0}, False),
    ("ISNUMBER(x)", {"x": 5}, True),
    ("ISNUMBER(x)", {"x": "5"}, False),
    ("ISTEXT(x)", {"x": "hi"}, True),
    # date (deterministic given inputs)
    ('DATEDIF(a, b, "D")', {"a": "2026-01-01", "b": "2026-01-31"}, 30.0),
    ("YEAR(d)", {"d": "2026-06-28"}, 2026),
    ("MONTH(d)", {"d": "2026-06-28"}, 6),
    ("DAY(d)", {"d": "2026-06-28"}, 28),
    # lookup (VLOOKUP-style, named ranges)
    ('LOOKUP(k, ["a", "b", "c"], [10, 20, 30])', {"k": "b"}, 20),
    # nesting + case-insensitivity (Sum/Round mixed case; IF must stay uppercase since
    # lowercase `if`/`and`/`or`/`not` are language keywords in both Python and JS)
    ('IF(Sum(a, b) > 10, "high", "low")', {"a": 7, "b": 5}, "high"),
    ("ROUND(AVERAGE(a, b, c), 1)", {"a": 1, "b": 2, "c": 2}, 1.7),
]


@pytest.mark.parametrize("expr,ctx,expected", CASES)
def test_excel_function_cases(expr: str, ctx: dict, expected: object) -> None:
    result = evaluate(expr, ctx)
    if isinstance(expected, float):
        assert isinstance(result, (int, float))
        assert math.isclose(float(result), expected, rel_tol=1e-9, abs_tol=1e-9)
    else:
        assert result == expected


def test_unknown_function_raises() -> None:
    with pytest.raises(ExpressionError):
        evaluate("BOGUS(1, 2)", {})


def test_if_short_circuits_bad_branch() -> None:
    # The untaken branch must not be evaluated, so a div-by-zero there is harmless.
    assert evaluate("IF(x > 0, 100, 1 / 0)", {"x": 5}) == 100


def test_blank_is_zero_inside_functions() -> None:
    # Excel-blank coercion applies inside functions (via _num), not to bare operators.
    assert evaluate("SUM(a, b)", {"a": 3}) == 3.0  # b missing -> skipped
    assert evaluate("a * 1 + ISBLANK(b)", {"a": 3, "b": None}) == 4  # True -> 1


def test_functions_fail_safe_in_relevance() -> None:
    # AVERAGE of nothing raises, but relevance swallows it to the default.
    assert evaluate_bool("AVERAGE() > 0", {}, default=False) is False


def test_dos_guard_still_active_through_functions() -> None:
    assert evaluate_bool("LEN('a' * 999999999) > 0", {}, default=False) is False

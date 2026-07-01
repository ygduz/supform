"""A small, **safe** expression evaluator for form logic.

Expressions appear in ``visibleIf``, ``enableIf``, ``requiredIf``, ``calculate`` and
custom validation. They reference other fields by ``name``, e.g.::

    age >= 18 and region == 'North'
    member_count * 2
    selected(languages, 'fr')

Safety: we parse with :mod:`ast` and evaluate only an allow-listed subset of node types.
No attribute access, calls (except registered helpers), imports, or comprehensions.

This deliberately mirrors the expression model used by SurveyJS / XLSForm relevance, but
stays language-neutral so the same strings can (later) be evaluated client-side too.
"""

from __future__ import annotations

import ast
import operator
from collections.abc import Callable
from typing import Any

from app.form_engine.functions import EAGER_FUNCTIONS, LAZY_FUNCTIONS

Context = dict[str, Any]


class ExpressionError(Exception):
    """Raised when an expression is malformed or uses disallowed syntax."""


# Cap exponents so a form expression like ``2 ** 9999999`` (which runs on every public
# submission) can't burn CPU/memory. Legitimate form math never needs a huge exponent.
_MAX_POW_EXPONENT = 64
# Cap sequence repetition (``'a' * n`` / ``[x] * n``) for the same reason: ``*`` on a
# str/list/tuple repeats it, so an unbounded count can allocate gigabytes.
_MAX_REPEAT = 10_000


def _safe_pow(base: Any, exponent: Any) -> Any:
    if isinstance(exponent, (int, float)) and abs(exponent) > _MAX_POW_EXPONENT:
        raise ExpressionError("Exponent too large")
    return operator.pow(base, exponent)


def _safe_mul(left: Any, right: Any) -> Any:
    # Sequence repetition is the dangerous case; numeric multiplication is cheap.
    for seq, count in ((left, right), (right, left)):
        if isinstance(seq, (str, bytes, list, tuple)) and isinstance(count, int):
            if count > _MAX_REPEAT:
                raise ExpressionError("Repetition count too large")
    return operator.mul(left, right)


_BIN_OPS: dict[type[ast.operator], Callable[[Any, Any], Any]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: _safe_mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: _safe_pow,
}

_CMP_OPS: dict[type[ast.cmpop], Callable[[Any, Any], Any]] = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
}


def _fn_selected(value: Any, option: Any) -> bool:
    """True if ``option`` is chosen — works for multi-choice lists and single values."""
    if isinstance(value, (list, tuple, set)):
        return option in value
    return value == option


# Registered, side-effect-free helper functions callable from expressions. The Excel
# catalog (functions.py) is merged in; legacy helpers (``selected``) and Python builtins
# keep working. Excel functions override the bare builtins (e.g. ``round`` -> Excel ROUND,
# ``len``/``count`` -> the form-aware versions) so behavior matches the documented catalog.
# All names are looked up case-insensitively, so ``SUM`` and ``sum`` are the same function.
_FUNCTIONS: dict[str, Callable[..., Any]] = {
    "selected": _fn_selected,
    "float": float,
    "str": str,
    "bool": bool,
    **EAGER_FUNCTIONS,
}


def evaluate(expression: str, context: Context) -> Any:
    """Evaluate ``expression`` against ``context`` (a mapping of field name -> value)."""
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:  # pragma: no cover - defensive
        raise ExpressionError(f"Invalid expression: {expression!r}") from exc
    return _eval(tree.body, context)


def evaluate_bool(expression: str | None, context: Context, *, default: bool = True) -> bool:
    """Convenience for relevance-style expressions; empty expression -> ``default``.

    Relevance runs on every public submission, so a logic error must never 500 the
    request. A malformed/erroring expression (e.g. ``age >= 18`` when ``age`` is
    unanswered, yielding ``None >= 18``) falls back to ``default`` — matching how
    ``calculate`` and custom validation already swallow their evaluation errors.
    """
    if not expression:
        return default
    try:
        return bool(evaluate(expression, context))
    except Exception:  # noqa: BLE001 - relevance must fail safe, never crash submission
        return default


def _eval(node: ast.AST, ctx: Context) -> Any:  # noqa: C901 - small dispatcher
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        # Bare identifiers resolve to field values (missing -> None).
        if node.id in ("True", "False", "None"):
            return {"True": True, "False": False, "None": None}[node.id]
        return ctx.get(node.id)
    if isinstance(node, ast.BoolOp):
        values = [_eval(v, ctx) for v in node.values]
        if isinstance(node.op, ast.And):
            return all(values)
        return any(values)
    if isinstance(node, ast.UnaryOp):
        val = _eval(node.operand, ctx)
        if isinstance(node.op, ast.Not):
            return not val
        if isinstance(node.op, ast.USub):
            return -val
        if isinstance(node.op, ast.UAdd):
            return +val
    if isinstance(node, ast.BinOp):
        op = _BIN_OPS.get(type(node.op))
        if op is None:
            raise ExpressionError(f"Operator not allowed: {type(node.op).__name__}")
        return op(_eval(node.left, ctx), _eval(node.right, ctx))
    if isinstance(node, ast.Compare):
        left = _eval(node.left, ctx)
        for op_node, comparator in zip(node.ops, node.comparators, strict=True):
            cmp = _CMP_OPS.get(type(op_node))
            if cmp is None:
                raise ExpressionError(f"Comparison not allowed: {type(op_node).__name__}")
            right = _eval(comparator, ctx)
            if not cmp(left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.IfExp):
        # Python ternary `a if cond else b` — short-circuits like Excel IF.
        return _eval(node.body, ctx) if _eval(node.test, ctx) else _eval(node.orelse, ctx)
    if isinstance(node, (ast.List, ast.Tuple)):
        return [_eval(e, ctx) for e in node.elts]
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ExpressionError("Only registered helper functions may be called")
        # Function names are case-insensitive (Excel convention): SUM == sum.
        name = node.func.id.lower()
        if node.keywords:
            raise ExpressionError("Keyword arguments are not allowed")
        lazy = LAZY_FUNCTIONS.get(name)
        if lazy is not None:
            # Lazy functions receive unevaluated arg nodes + an evaluator so they can
            # short-circuit (IF only runs the taken branch; IFERROR catches errors). A
            # runtime failure propagates naturally — the fail-safe layers (evaluate_bool /
            # calculate) swallow it, while structural problems below raise ExpressionError.
            return lazy(node.args, lambda n: _eval(n, ctx))
        fn = _FUNCTIONS.get(name)
        if fn is None:
            raise ExpressionError(f"Unknown function: {node.func.id}")
        return fn(*[_eval(a, ctx) for a in node.args])
    raise ExpressionError(f"Unsupported expression element: {type(node).__name__}")

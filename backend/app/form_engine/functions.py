"""Excel-style function library for the form expression engine.

These functions are callable from any ``calculate`` / ``visibleIf`` / validation
expression, e.g.::

    IF(age >= 18, "adult", "minor")
    SUM(q1, q2, q3)
    ROUND(price * 1.2, 2)
    CONCAT(first_name, " ", last_name)

Names are matched **case-insensitively** (Excel is uppercase by convention, but
``if(...)`` works too). The exact same catalog is mirrored in the frontend
(``frontend/src/features/renderer/functions.ts``) so client-side live preview and
server-side authoritative evaluation can never diverge — every function here has a
1:1 parity test in ``test_functions.py`` / ``functions.test.ts``.

**Excel-blank semantics.** A missing/unanswered field arrives as ``None``. In numeric
context it behaves as ``0``; in text context as ``""`` — matching how Excel treats an
empty cell. Helpers ``_num`` / ``_text`` centralise that coercion.

Functions come in two flavours:

* **Eager** (``EAGER_FUNCTIONS``) — arguments are evaluated before the function runs.
  This is the vast majority (SUM, ROUND, LEFT, …).
* **Lazy** (``LAZY_FUNCTIONS``) — the function receives *unevaluated* argument nodes plus
  an ``eval_fn`` so it can short-circuit. Needed for ``IF`` (only the taken branch should
  run) and ``IFERROR`` (must catch errors raised while evaluating its first argument).
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable
from typing import Any

# ── coercion helpers (Excel-blank semantics) ─────────────────────────────────────


def _num(value: Any) -> float:
    """Coerce to a number the way Excel coerces a cell: blank -> 0, numeric str -> number."""
    if value is None or value == "":
        return 0.0
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Not a number: {value!r}") from exc


def _text(value: Any) -> str:
    """Coerce to text: blank -> "", booleans -> TRUE/FALSE (Excel-style)."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _truthy(value: Any) -> bool:
    """Excel truthiness: blank/0/"" are false; everything else true."""
    if value is None or value == "":
        return False
    if isinstance(value, (int, float)):
        return value != 0
    return bool(value)


def _flatten(args: Iterable[Any]) -> list[Any]:
    """Flatten one level of lists/tuples so SUM(q1, [a, b]) works like a range."""
    out: list[Any] = []
    for a in args:
        if isinstance(a, (list, tuple)):
            out.extend(a)
        else:
            out.append(a)
    return out


def _numbers(args: Iterable[Any]) -> list[float]:
    """The numeric members of a flattened arg list, skipping blanks/non-numbers (like Excel)."""
    nums: list[float] = []
    for a in _flatten(args):
        if a is None or a == "":
            continue
        if isinstance(a, bool):
            nums.append(1.0 if a else 0.0)
            continue
        if isinstance(a, (int, float)):
            nums.append(float(a))
            continue
        try:
            nums.append(float(str(a).strip()))
        except (TypeError, ValueError):
            continue
    return nums


def _round_half_up(x: float, digits: int) -> float:
    """Excel ROUND rounds half away from zero (Python's round is banker's)."""
    factor = 10.0**digits
    scaled = x * factor
    rounded = math.floor(abs(scaled) + 0.5) * (1 if scaled >= 0 else -1)
    return rounded / factor


def _matches(value: Any, criterion: Any) -> bool:
    """COUNTIF/SUMIF criterion: bare value = equality; ">5"/"<=3"/"<>x" comparisons."""
    if isinstance(criterion, str):
        for prefix, cmp in (
            (">=", lambda a, b: a >= b),
            ("<=", lambda a, b: a <= b),
            ("<>", lambda a, b: a != b),
            (">", lambda a, b: a > b),
            ("<", lambda a, b: a < b),
            ("=", lambda a, b: a == b),
        ):
            if criterion.startswith(prefix):
                rest = criterion[len(prefix) :].strip()
                try:
                    return cmp(_num(value), _num(rest))
                except ValueError:
                    return cmp(_text(value), rest)
    return value == criterion or _text(value) == _text(criterion)


# ── eager functions ──────────────────────────────────────────────────────────────


def _fn_sum(*args: Any) -> float:
    return sum(_numbers(args))


def _fn_average(*args: Any) -> float:
    nums = _numbers(args)
    if not nums:
        raise ValueError("AVERAGE of no numbers")
    return sum(nums) / len(nums)


def _fn_min(*args: Any) -> float:
    nums = _numbers(args)
    return min(nums) if nums else 0.0


def _fn_max(*args: Any) -> float:
    nums = _numbers(args)
    return max(nums) if nums else 0.0


def _fn_count(*args: Any) -> int:
    return len(_numbers(args))


def _fn_counta(*args: Any) -> int:
    return sum(1 for a in _flatten(args) if a is not None and a != "")


def _fn_countif(rng: Any, criterion: Any) -> int:
    items = rng if isinstance(rng, (list, tuple)) else [rng]
    return sum(1 for a in items if _matches(a, criterion))


def _fn_sumif(rng: Any, criterion: Any, sum_range: Any = None) -> float:
    items = list(rng) if isinstance(rng, (list, tuple)) else [rng]
    targets = (
        list(sum_range)
        if isinstance(sum_range, (list, tuple))
        else (items if sum_range is None else [sum_range])
    )
    total = 0.0
    for i, a in enumerate(items):
        if _matches(a, criterion) and i < len(targets):
            try:
                total += _num(targets[i])
            except ValueError:
                pass
    return total


def _fn_round(x: Any, digits: Any = 0) -> float:
    return _round_half_up(_num(x), int(_num(digits)))


def _fn_roundup(x: Any, digits: Any = 0) -> float:
    factor = 10.0 ** int(_num(digits))
    v = _num(x) * factor
    return (math.ceil(v) if v >= 0 else math.floor(v)) / factor


def _fn_rounddown(x: Any, digits: Any = 0) -> float:
    factor = 10.0 ** int(_num(digits))
    v = _num(x) * factor
    return (math.floor(v) if v >= 0 else math.ceil(v)) / factor


def _fn_floor(x: Any, significance: Any = 1) -> float:
    sig = _num(significance)
    if sig == 0:
        return 0.0
    return math.floor(_num(x) / sig) * sig


def _fn_ceiling(x: Any, significance: Any = 1) -> float:
    sig = _num(significance)
    if sig == 0:
        return 0.0
    return math.ceil(_num(x) / sig) * sig


def _fn_mod(a: Any, b: Any) -> float:
    # Python `%` already takes the sign of the divisor (Excel's convention). Division by
    # zero raises, which the fail-safe layers swallow (matching the JS NaN -> unset).
    return _num(a) % _num(b)


def _fn_concat(*args: Any) -> str:
    return "".join(_text(a) for a in _flatten(args))


def _fn_left(s: Any, n: Any = 1) -> str:
    return _text(s)[: max(0, int(_num(n)))]


def _fn_right(s: Any, n: Any = 1) -> str:
    n = max(0, int(_num(n)))
    return _text(s)[-n:] if n else ""


def _fn_mid(s: Any, start: Any, length: Any) -> str:
    start = max(1, int(_num(start)))
    return _text(s)[start - 1 : start - 1 + max(0, int(_num(length)))]


def _fn_substitute(s: Any, old: Any, new: Any, which: Any = None) -> str:
    text, old_s, new_s = _text(s), _text(old), _text(new)
    if not old_s:
        return text
    if which is None:
        return text.replace(old_s, new_s)
    n = int(_num(which))
    # Replace only the nth occurrence (1-based), like Excel's instance_num.
    idx = -1
    for _ in range(n):
        idx = text.find(old_s, idx + 1)
        if idx == -1:
            return text
    return text[:idx] + new_s + text[idx + len(old_s) :]


def _fn_value(s: Any) -> float:
    return _num(s)


def _fn_isblank(value: Any) -> bool:
    return value is None or value == ""


def _fn_isnumber(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _fn_istext(value: Any) -> bool:
    return isinstance(value, str)


def _fn_datedif(start: Any, end: Any, unit: Any = "D") -> float:
    from datetime import date, datetime

    def _parse(v: Any) -> date:
        if isinstance(v, datetime):
            return v.date()
        if isinstance(v, date):
            return v
        return datetime.fromisoformat(_text(v)[:10]).date()

    d0, d1 = _parse(start), _parse(end)
    u = _text(unit).upper()
    if u == "Y":
        return float(d1.year - d0.year - ((d1.month, d1.day) < (d0.month, d0.day)))
    if u == "M":
        return float((d1.year - d0.year) * 12 + (d1.month - d0.month) - (d1.day < d0.day))
    return float((d1 - d0).days)


def _date_part(value: Any, part: str) -> int:
    from datetime import date, datetime

    if isinstance(value, (date, datetime)):
        d = value
    else:
        d = datetime.fromisoformat(_text(value)[:10])
    return {"year": d.year, "month": d.month, "day": d.day}[part]


def _fn_lookup(key: Any, keys: Any, values: Any) -> Any:
    """VLOOKUP-style: find ``key`` in the ``keys`` list, return the aligned ``values`` entry."""
    ks = list(keys) if isinstance(keys, (list, tuple)) else [keys]
    vs = list(values) if isinstance(values, (list, tuple)) else [values]
    for i, k in enumerate(ks):
        if k == key or _text(k) == _text(key):
            return vs[i] if i < len(vs) else None
    raise ValueError(f"LOOKUP: {key!r} not found")


def _fn_today() -> str:
    """Current date as an ISO ``YYYY-MM-DD`` string (stable within a day; matches JS mirror)."""
    from datetime import date

    return date.today().isoformat()


EAGER_FUNCTIONS: dict[str, Callable[..., Any]] = {
    "today": _fn_today,
    "lookup": _fn_lookup,
    "sum": _fn_sum,
    "average": _fn_average,
    "min": _fn_min,
    "max": _fn_max,
    "count": _fn_count,
    "counta": _fn_counta,
    "countif": _fn_countif,
    "sumif": _fn_sumif,
    "round": _fn_round,
    "roundup": _fn_roundup,
    "rounddown": _fn_rounddown,
    "floor": _fn_floor,
    "ceiling": _fn_ceiling,
    "mod": _fn_mod,
    "abs": lambda x: abs(_num(x)),
    "power": lambda b, e: _num(b) ** _num(e),
    "sqrt": lambda x: math.sqrt(_num(x)),
    "int": lambda x: math.floor(_num(x)),
    "concat": _fn_concat,
    "concatenate": _fn_concat,
    "left": _fn_left,
    "right": _fn_right,
    "mid": _fn_mid,
    "len": lambda s: len(_text(s)),
    "upper": lambda s: _text(s).upper(),
    "lower": lambda s: _text(s).lower(),
    "trim": lambda s: _text(s).strip(),
    "substitute": _fn_substitute,
    "value": _fn_value,
    "isblank": _fn_isblank,
    "isnumber": _fn_isnumber,
    "istext": _fn_istext,
    "datedif": _fn_datedif,
    "year": lambda v: _date_part(v, "year"),
    "month": lambda v: _date_part(v, "month"),
    "day": lambda v: _date_part(v, "day"),
}


# ── lazy functions (receive AST arg nodes + an eval_fn for short-circuiting) ──────

EvalFn = Callable[[Any], Any]


def _lazy_if(args: list[Any], ev: EvalFn) -> Any:
    if not 2 <= len(args) <= 3:
        raise ValueError("IF takes (condition, then, [else])")
    if _truthy(ev(args[0])):
        return ev(args[1])
    return ev(args[2]) if len(args) == 3 else False


def _lazy_ifs(args: list[Any], ev: EvalFn) -> Any:
    if len(args) % 2 != 0:
        raise ValueError("IFS takes condition/value pairs")
    for i in range(0, len(args), 2):
        if _truthy(ev(args[i])):
            return ev(args[i + 1])
    raise ValueError("IFS: no condition matched")


def _lazy_and(args: list[Any], ev: EvalFn) -> bool:
    return all(_truthy(ev(a)) for a in args)


def _lazy_or(args: list[Any], ev: EvalFn) -> bool:
    return any(_truthy(ev(a)) for a in args)


def _lazy_not(args: list[Any], ev: EvalFn) -> bool:
    if len(args) != 1:
        raise ValueError("NOT takes one argument")
    return not _truthy(ev(args[0]))


def _lazy_switch(args: list[Any], ev: EvalFn) -> Any:
    if len(args) < 3:
        raise ValueError("SWITCH takes (expr, case, value, ... [, default])")
    subject = ev(args[0])
    rest = args[1:]
    i = 0
    while i + 1 < len(rest):
        if ev(rest[i]) == subject:
            return ev(rest[i + 1])
        i += 2
    if i < len(rest):  # trailing default
        return ev(rest[i])
    raise ValueError("SWITCH: no case matched and no default")


def _lazy_iferror(args: list[Any], ev: EvalFn) -> Any:
    if len(args) != 2:
        raise ValueError("IFERROR takes (value, fallback)")
    try:
        result = ev(args[0])
    except Exception:  # noqa: BLE001 - the whole point: swallow and use the fallback
        return ev(args[1])
    # Excel also treats NaN/inf as errors.
    if isinstance(result, float) and not math.isfinite(result):
        return ev(args[1])
    return result


LAZY_FUNCTIONS: dict[str, Callable[[list[Any], EvalFn], Any]] = {
    "if": _lazy_if,
    "ifs": _lazy_ifs,
    "and": _lazy_and,
    "or": _lazy_or,
    "not": _lazy_not,
    "switch": _lazy_switch,
    "iferror": _lazy_iferror,
}

"""Validate a submission's answers against a form version's schema.

The validator walks the form tree (pages -> elements, recursing into groups and repeats)
so it understands the full model, not just flat scalar fields:

- **Relevance** — a field hidden by ``visibleIf`` is neither required nor stored.
- **Required / requiredIf** — conditional mandatoriness.
- **Calculations** — ``calculate`` fields are recomputed server-side so derived values
  can't be spoofed by the client.
- **Groups** — transparent containers; their children live in the same answer scope.
- **Repeats** — a list of instance dicts, each validated in its own scope, plus
  min/max-count checks.
- **Matrix** — a ``{row: column}`` map with row/column membership checks.
- **Multi-choice** — a list of option values with membership + min/max-selected checks.

Errors are keyed by a path: top-level fields by ``name``; repeat children by
``members[0].member_name``-style paths.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.form_engine.expressions import evaluate, evaluate_bool
from app.schemas.form_schema import Element, FormSchema

_PRESENTATIONAL = ("note", "section", "html")

# Cap the input a custom regex runs against. Author-supplied patterns execute on every
# public submission, so bounding the input length limits worst-case (ReDoS) cost.
_MAX_PATTERN_INPUT = 4096


@dataclass
class SubmissionValidationResult:
    errors: dict[str, str] = field(default_factory=dict)
    cleaned: dict[str, Any] = field(default_factory=dict)

    @property
    def is_valid(self) -> bool:
        return not self.errors


def validate_submission(form: FormSchema, answers: dict[str, Any]) -> SubmissionValidationResult:
    result = SubmissionValidationResult(cleaned=dict(answers))
    for page in form.pages:
        if not evaluate_bool(page.visible_if, answers, default=True):
            for name in _walk_names(page.elements):
                result.cleaned.pop(name, None)
            continue
        _validate_scope(page.elements, answers, result.cleaned, result.errors, dict(answers), "")
    return result


def _validate_scope(
    elements: list[Element],
    answers: dict[str, Any],
    cleaned: dict[str, Any],
    errors: dict[str, str],
    ctx: dict[str, Any],
    path: str,
) -> None:
    """Validate a flat scope (a page, a group, or one repeat instance)."""
    for el in elements:
        key = f"{path}{el.name}"

        if el.type in _PRESENTATIONAL:
            continue

        if not evaluate_bool(el.visible_if, ctx, default=True):
            cleaned.pop(el.name, None)
            continue

        if el.calculate:
            try:
                cleaned[el.name] = evaluate(el.calculate, ctx)
                ctx[el.name] = cleaned[el.name]
            except Exception:  # noqa: BLE001 - a bad calc must not 500 the request
                pass
            continue

        if el.type == "group":
            _validate_scope(el.elements or [], answers, cleaned, errors, ctx, path)
            continue

        if el.type == "repeat":
            _validate_repeat(el, answers, cleaned, errors, ctx, key)
            continue

        error = _validate_field(el, answers.get(el.name), ctx)
        if error:
            errors[key] = error


def _validate_repeat(
    el: Element,
    answers: dict[str, Any],
    cleaned: dict[str, Any],
    errors: dict[str, str],
    ctx: dict[str, Any],
    key: str,
) -> None:
    instances = answers.get(el.name)
    rmin = el.repeat.min if el.repeat else 0
    rmax = el.repeat.max if el.repeat else None
    required = el.required or rmin > 0

    if _is_empty(instances):
        cleaned[el.name] = []
        if required:
            errors[key] = f"Add at least {max(rmin, 1)} entr{'y' if max(rmin, 1) == 1 else 'ies'}."
        return

    if not isinstance(instances, list):
        errors[key] = "Expected a list of entries."
        return

    if rmin and len(instances) < rmin:
        errors[key] = f"Add at least {rmin} entries."
    if rmax is not None and len(instances) > rmax:
        errors[key] = f"At most {rmax} entries allowed."

    cleaned_instances: list[dict[str, Any]] = []
    for i, raw in enumerate(instances):
        instance = raw if isinstance(raw, dict) else {}
        instance_cleaned = dict(instance)
        _validate_scope(
            el.elements or [],
            instance,
            instance_cleaned,
            errors,
            {**ctx, **instance},
            f"{key}[{i}].",
        )
        cleaned_instances.append(instance_cleaned)
    cleaned[el.name] = cleaned_instances


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _validate_field(el: Element, value: Any, ctx: dict[str, Any]) -> str | None:
    required = el.required or evaluate_bool(el.required_if, ctx, default=False)
    if _is_empty(value):
        return "This field is required." if required else None

    if el.type == "matrix":
        return _validate_matrix(el, value, required)
    if el.type == "multi_choice":
        return _validate_multi_choice(el, value)

    v = el.validation
    if v is not None:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if v.min is not None and value < v.min:
                return _msg(v.message, f"Must be ≥ {v.min}.")
            if v.max is not None and value > v.max:
                return _msg(v.message, f"Must be ≤ {v.max}.")
        if isinstance(value, str):
            if v.min_length is not None and len(value) < v.min_length:
                return _msg(v.message, f"Must be at least {v.min_length} characters.")
            if v.max_length is not None and len(value) > v.max_length:
                return _msg(v.message, f"Must be at most {v.max_length} characters.")
            if v.pattern:
                if len(value) > _MAX_PATTERN_INPUT:
                    return _msg(v.message, "Value is too long.")
                if not re.fullmatch(v.pattern, value):
                    return _msg(v.message, "Invalid format.")
        if v.expression:
            try:
                if not evaluate(v.expression, {**ctx, "value": value}):
                    return _msg(v.message, "Failed validation rule.")
            except Exception:  # noqa: BLE001
                pass

    if el.options and el.type in ("single_choice", "dropdown"):
        if value not in {c.value for c in el.options}:
            return "Value is not one of the allowed choices."

    return None


def _validate_matrix(el: Element, value: Any, required: bool) -> str | None:
    if not isinstance(value, dict):
        return "Invalid matrix answer."
    rows = {r.value for r in (el.rows or [])}
    cols = {c.value for c in (el.columns or [])}
    for row, col in value.items():
        if row not in rows:
            return "Answer references an unknown row."
        if not _is_empty(col) and col not in cols:
            return "Invalid selection for a row."
    if required and any(_is_empty(value.get(r)) for r in rows):
        return "Please answer every row."
    return None


def _validate_multi_choice(el: Element, value: Any) -> str | None:
    if not isinstance(value, list):
        return "Expected one or more selections."
    if el.options and any(item not in {c.value for c in el.options} for item in value):
        return "An invalid option was selected."
    v = el.validation
    if v is not None:
        if v.min_selected is not None and len(value) < v.min_selected:
            return _msg(v.message, f"Select at least {v.min_selected}.")
        if v.max_selected is not None and len(value) > v.max_selected:
            return _msg(v.message, f"Select at most {v.max_selected}.")
    return None


def _walk_names(elements: list[Element]) -> list[str]:
    names: list[str] = []
    for el in elements:
        names.append(el.name)
        if el.elements:
            names.extend(_walk_names(el.elements))
    return names


def _msg(custom: Any, default: str) -> str:
    if isinstance(custom, str):
        return custom
    if isinstance(custom, dict) and custom:
        return next(iter(custom.values()))
    return default

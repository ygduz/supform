"""Validate a submission's answers against a form version's schema.

This is logic-aware: a field that is hidden by ``visibleIf`` is not required, and
``requiredIf`` can make a field conditionally mandatory. Calculations are (re)computed
server-side so derived values can't be spoofed by the client.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.form_engine.expressions import evaluate, evaluate_bool
from app.schemas.form_schema import Element, FormSchema


@dataclass
class SubmissionValidationResult:
    errors: dict[str, str] = field(default_factory=dict)
    cleaned: dict[str, Any] = field(default_factory=dict)

    @property
    def is_valid(self) -> bool:
        return not self.errors


def validate_submission(form: FormSchema, answers: dict[str, Any]) -> SubmissionValidationResult:
    result = SubmissionValidationResult(cleaned=dict(answers))
    ctx = dict(answers)

    for el in form.iter_elements():
        if el.type in ("note", "section", "html", "group", "repeat"):
            continue

        # Skip hidden fields (relevance) — they aren't required and aren't validated.
        if not evaluate_bool(el.visible_if, ctx, default=True):
            result.cleaned.pop(el.name, None)
            continue

        # Server-side recompute of calculated values.
        if el.calculate:
            try:
                result.cleaned[el.name] = evaluate(el.calculate, ctx)
                ctx[el.name] = result.cleaned[el.name]
            except Exception:  # noqa: BLE001 - calc errors shouldn't 500 the request
                pass
            continue

        value = answers.get(el.name)
        error = _validate_value(el, value, ctx)
        if error:
            result.errors[el.name] = error

    return result


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _validate_value(el: Element, value: Any, ctx: dict[str, Any]) -> str | None:
    required = el.required or evaluate_bool(el.required_if, ctx, default=False)
    if _is_empty(value):
        return "This field is required." if required else None

    v = el.validation
    if v is not None:
        if isinstance(value, (int, float)):
            if v.min is not None and value < v.min:
                return _msg(v.message, f"Must be ≥ {v.min}.")
            if v.max is not None and value > v.max:
                return _msg(v.message, f"Must be ≤ {v.max}.")
        if isinstance(value, str):
            if v.min_length is not None and len(value) < v.min_length:
                return _msg(v.message, f"Must be at least {v.min_length} characters.")
            if v.max_length is not None and len(value) > v.max_length:
                return _msg(v.message, f"Must be at most {v.max_length} characters.")
            if v.pattern and not re.fullmatch(v.pattern, value):
                return _msg(v.message, "Invalid format.")
        if isinstance(value, list):
            if v.min_selected is not None and len(value) < v.min_selected:
                return _msg(v.message, f"Select at least {v.min_selected}.")
            if v.max_selected is not None and len(value) > v.max_selected:
                return _msg(v.message, f"Select at most {v.max_selected}.")
        if v.expression:
            try:
                if not evaluate(v.expression, {**ctx, "value": value}):
                    return _msg(v.message, "Failed validation rule.")
            except Exception:  # noqa: BLE001
                pass

    # Choice membership check.
    if el.options and el.type in ("single_choice", "dropdown"):
        allowed = {c.value for c in el.options}
        if value not in allowed:
            return "Value is not one of the allowed choices."

    return None


def _msg(custom: Any, default: str) -> str:
    if isinstance(custom, str):
        return custom
    if isinstance(custom, dict) and custom:
        return next(iter(custom.values()))
    return default

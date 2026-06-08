"""Validate that a form *definition* is well-formed and internally consistent.

This goes beyond Pydantic structural validation: it checks cross-references (unique field
names, logic referencing existing fields, choice elements actually having options, etc.).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.form_engine.expressions import ExpressionError, evaluate
from app.schemas.form_schema import Element, FormSchema

# Types that require a non-empty options list.
_CHOICE_TYPES = {"single_choice", "multi_choice", "dropdown", "ranking"}
_CONTAINER_TYPES = {"group", "repeat", "section"}


@dataclass
class SchemaIssue:
    level: str  # "error" | "warning"
    path: str
    message: str


def validate_form(form: FormSchema) -> list[SchemaIssue]:
    """Return a list of issues. An empty list means the form is valid."""
    issues: list[SchemaIssue] = []

    names: dict[str, int] = {}
    for el in form.iter_elements():
        names[el.name] = names.get(el.name, 0) + 1
    for name, count in names.items():
        if count > 1:
            issues.append(SchemaIssue("error", name, f"Duplicate field name '{name}'."))

    known = set(names)
    for page in form.pages:
        _check_expression(page.visible_if, f"page:{page.name}.visibleIf", known, issues)
        for el in page.elements:
            _check_element(el, f"{page.name}", known, issues)

    return issues


def _check_element(el: Element, path: str, known: set[str], issues: list[SchemaIssue]) -> None:
    here = f"{path}.{el.name}"

    if el.type in _CHOICE_TYPES and not (el.options or el.options_from):
        issues.append(SchemaIssue("error", here, f"'{el.type}' element needs options."))

    if el.type == "matrix" and not (el.rows and el.columns):
        issues.append(SchemaIssue("error", here, "matrix element needs rows and columns."))

    for attr in ("visible_if", "enable_if", "required_if", "calculate"):
        _check_expression(getattr(el, attr), f"{here}.{attr}", known, issues)
    if el.validation and el.validation.expression:
        _check_expression(el.validation.expression, f"{here}.validation", known, issues)

    if el.type in _CONTAINER_TYPES and el.elements:
        for child in el.elements:
            _check_element(child, here, known, issues)


def _check_expression(
    expr: str | None, path: str, known: set[str], issues: list[SchemaIssue]
) -> None:
    if not expr:
        return
    try:
        # Evaluate against a context of all-None to surface syntax/operator errors early.
        evaluate(expr, dict.fromkeys(known))
    except ExpressionError as exc:
        issues.append(SchemaIssue("error", path, f"Invalid logic expression: {exc}"))
    except Exception:
        # Runtime errors (e.g. None arithmetic) are fine here — we only check syntax.
        pass

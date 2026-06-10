"""Quiz scoring: total points from chosen options, and outcome-band matching.

When a form sets ``settings.quizMode``, each chosen option's ``score`` is summed and stored
on the submission so it can be reported, exported, and matched to an outcome message.
"""

from __future__ import annotations

from app.schemas.form_schema import Element, FormSchema, FormSettings, Outcome


def _score_for(el: Element, value: object) -> float:
    options = el.options or []
    chosen = value if isinstance(value, list) else [value]
    total = 0.0
    for opt in options:
        if opt.score is not None and opt.value in chosen:
            total += opt.score
    return total


def compute_score(schema: FormSchema, answers: dict[str, object]) -> float:
    """Sum the scores of every chosen option across the form's scorable fields."""
    total = 0.0
    for el in schema.iter_elements():
        if el.options and el.name in answers:
            total += _score_for(el, answers[el.name])
    return total


def match_outcome(settings: FormSettings, score: float) -> Outcome | None:
    """The first outcome band whose [min, max] contains ``score`` (or None)."""
    for outcome in settings.outcomes:
        if outcome.min <= score <= outcome.max:
            return outcome
    return None

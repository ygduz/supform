"""Quiz scoring and grading.

Two complementary models, both gated by ``settings.quizMode``:

* **Option scores** — each chosen option's ``score`` is summed into ``_score`` (personality /
  weighted-survey style; maps to an outcome band).
* **Correct-answer grading** — questions that declare a correct answer (per-option ``correct``
  flags or an element ``correctAnswer``) are graded for correctness and award ``points``,
  producing earned/max points, a correct count, and per-question results.

All values are computed server-side so a client cannot inflate its own result.
"""

from __future__ import annotations

from typing import Any

from app.schemas.form_schema import Element, FormSchema, FormSettings, Outcome

# Text-family types are graded case-insensitively after trimming whitespace.
_TEXT_TYPES = frozenset({"text", "longtext", "email", "url", "phone"})


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


# ── correct-answer grading ──────────────────────────────────────────────────────


def is_graded(el: Element) -> bool:
    """True if the element declares a correct answer (and so participates in grading)."""
    if el.correct_answer is not None:
        return True
    return any(o.correct for o in (el.options or []))


def _norm(value: Any, el_type: str) -> Any:
    """Normalize a value for comparison (text answers are trimmed + case-folded)."""
    if el_type in _TEXT_TYPES and isinstance(value, str):
        return value.strip().casefold()
    return value


def _expected_values(el: Element) -> list[Any]:
    """The set of accepted correct values: explicit ``correctAnswer`` or flagged options."""
    if el.correct_answer is not None:
        ca = el.correct_answer
        return list(ca) if isinstance(ca, list) else [ca]
    return [o.value for o in (el.options or []) if o.correct]


def grade_field(el: Element, value: Any) -> tuple[bool, float, float]:
    """Grade one answer. Returns (is_correct, earned_points, max_points).

    Multi-select answers must match the correct set exactly; single answers must be one of
    the accepted values. ``points`` defaults to 1 when unset.
    """
    points = float(el.points) if el.points is not None else 1.0
    expected = _expected_values(el)
    if not expected:  # guarded by is_graded, but stay defensive
        return (False, 0.0, points)
    t = str(el.type)
    want = {_norm(v, t) for v in expected}
    if isinstance(value, list):
        correct = {_norm(v, t) for v in value} == want
    else:
        correct = _norm(value, t) in want
    return (correct, points if correct else 0.0, points)


def grade_submission(schema: FormSchema, answers: dict[str, Any]) -> dict[str, Any]:
    """Grade every answered, correct-answer question. Returns a results summary dict.

    Only questions present in ``answers`` are graded — hidden (irrelevant) questions are
    already stripped from the cleaned answers, and unanswered optional questions don't count.
    """
    earned = 0.0
    max_points = 0.0
    correct_count = 0
    graded_count = 0
    per_field: dict[str, Any] = {}
    for el in schema.iter_elements():
        if not is_graded(el) or el.name not in answers:
            continue
        value = answers[el.name]
        if value is None or value == "" or value == []:
            continue
        ok, got, pts = grade_field(el, value)
        graded_count += 1
        max_points += pts
        earned += got
        if ok:
            correct_count += 1
        per_field[el.name] = {
            "correct": ok,
            "earned": got,
            "points": pts,
            "correctAnswer": _expected_values(el),
        }
    return {
        "earnedPoints": earned,
        "maxPoints": max_points,
        "correctCount": correct_count,
        "gradedCount": graded_count,
        "perField": per_field,
    }

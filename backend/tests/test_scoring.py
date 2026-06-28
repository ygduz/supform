"""Quiz scoring: server-computed score and outcome-band matching."""

from __future__ import annotations

from app.form_engine import compute_score, grade_submission, match_outcome
from app.form_engine.scoring import grade_field, is_graded
from app.schemas.form_schema import Element, FormSchema


def _quiz() -> FormSchema:
    return FormSchema.model_validate(
        {
            "name": "quiz",
            "title": "Quiz",
            "settings": {
                "quizMode": True,
                "outcomes": [
                    {"min": 0, "max": 1, "message": "Keep studying"},
                    {"min": 2, "max": 3, "message": "Great job"},
                ],
            },
            "pages": [
                {
                    "name": "p1",
                    "elements": [
                        {
                            "type": "single_choice",
                            "name": "q1",
                            "options": [
                                {"value": "a", "score": 1},
                                {"value": "b", "score": 0},
                            ],
                        },
                        {
                            "type": "multi_choice",
                            "name": "q2",
                            "options": [
                                {"value": "x", "score": 1},
                                {"value": "y", "score": 1},
                                {"value": "z", "score": 0},
                            ],
                        },
                    ],
                }
            ],
        }
    )


def test_compute_score_sums_chosen_option_points() -> None:
    schema = _quiz()
    assert compute_score(schema, {"q1": "a", "q2": ["x", "y"]}) == 3
    assert compute_score(schema, {"q1": "b", "q2": ["z"]}) == 0
    assert compute_score(schema, {"q1": "a"}) == 1


def test_match_outcome_picks_the_band_containing_the_score() -> None:
    settings = _quiz().settings
    assert match_outcome(settings, 0).message == "Keep studying"
    assert match_outcome(settings, 3).message == "Great job"
    assert match_outcome(settings, 99) is None


# ── correct-answer grading ──────────────────────────────────────────────────────


def _graded_quiz() -> FormSchema:
    return FormSchema.model_validate(
        {
            "name": "exam",
            "title": "Exam",
            "settings": {"quizMode": True},
            "pages": [
                {
                    "name": "p1",
                    "elements": [
                        {
                            "type": "single_choice",
                            "name": "capital",
                            "points": 2,
                            "options": [
                                {"value": "paris", "correct": True},
                                {"value": "lyon"},
                            ],
                        },
                        {
                            "type": "multi_choice",
                            "name": "primes",
                            "options": [
                                {"value": "2", "correct": True},
                                {"value": "3", "correct": True},
                                {"value": "4"},
                            ],
                        },
                        {"type": "text", "name": "river", "correctAnswer": "Nile"},
                        {"type": "text", "name": "ungraded"},
                    ],
                }
            ],
        }
    )


def test_is_graded_detects_correct_answer_and_flagged_options() -> None:
    schema = _graded_quiz()
    by = {el.name: el for el in schema.iter_elements()}
    assert is_graded(by["capital"]) and is_graded(by["primes"]) and is_graded(by["river"])
    assert not is_graded(by["ungraded"])


def test_grade_field_single_multi_and_text() -> None:
    schema = _graded_quiz()
    by = {el.name: el for el in schema.iter_elements()}
    # single choice, custom points
    assert grade_field(by["capital"], "paris") == (True, 2.0, 2.0)
    assert grade_field(by["capital"], "lyon") == (False, 0.0, 2.0)
    # multi choice needs exact-set match; partial is wrong; default 1 point
    assert grade_field(by["primes"], ["2", "3"]) == (True, 1.0, 1.0)
    assert grade_field(by["primes"], ["2"]) == (False, 0.0, 1.0)
    assert grade_field(by["primes"], ["2", "3", "4"]) == (False, 0.0, 1.0)
    # text key is trimmed + case-insensitive
    assert grade_field(by["river"], "  nile ")[0] is True
    assert grade_field(by["river"], "Amazon")[0] is False


def test_grade_submission_summary() -> None:
    schema = _graded_quiz()
    g = grade_submission(schema, {"capital": "paris", "primes": ["2"], "river": "Nile"})
    assert g["gradedCount"] == 3
    assert g["correctCount"] == 2  # capital + river right, primes wrong
    assert g["maxPoints"] == 4.0  # 2 + 1 + 1
    assert g["earnedPoints"] == 3.0  # 2 (capital) + 1 (river)
    assert g["perField"]["capital"]["correct"] is True
    assert g["perField"]["primes"]["correct"] is False
    assert g["perField"]["river"]["correctAnswer"] == ["Nile"]


def test_grade_submission_ignores_unanswered_and_ungraded() -> None:
    schema = _graded_quiz()
    # only 'capital' answered; 'ungraded' has no correct answer; others skipped
    g = grade_submission(schema, {"capital": "paris", "ungraded": "whatever"})
    assert g["gradedCount"] == 1
    assert g["maxPoints"] == 2.0 and g["earnedPoints"] == 2.0


def test_grade_field_defaults_to_one_point() -> None:
    el = Element.model_validate(
        {"type": "single_choice", "name": "q", "options": [{"value": "a", "correct": True}]}
    )
    assert grade_field(el, "a") == (True, 1.0, 1.0)


def test_grade_field_boolean_answer_key() -> None:
    # Booleans store true/false; the answer key must be a real boolean (builder writes one).
    el = Element.model_validate({"type": "boolean", "name": "agree", "correctAnswer": True})
    assert grade_field(el, True)[0] is True
    assert grade_field(el, False)[0] is False

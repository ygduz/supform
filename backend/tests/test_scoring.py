"""Quiz scoring: server-computed score and outcome-band matching."""

from __future__ import annotations

from app.form_engine import compute_score, match_outcome
from app.schemas.form_schema import FormSchema


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

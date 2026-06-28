"""Quiz authoring via the SDK: option flags, correct answers, points, feedback, outcomes."""

from supform_sdk import Form, fields


def test_option_helper_carries_score_and_correct():
    opt = fields.Option("paris", "Paris", correct=True, score=2)
    assert opt == {"value": "paris", "label": "Paris", "score": 2, "correct": True}
    # Bare option omits absent keys.
    assert fields.Option("lyon") == {"value": "lyon"}


def test_choice_builder_accepts_correct_options_and_points():
    el = fields.SingleChoice(
        "capital",
        label="Capital?",
        options=[fields.Option("paris", "Paris", correct=True), fields.Option("lyon", "Lyon")],
        points=2,
    )
    assert el["points"] == 2
    assert el["options"][0]["correct"] is True
    assert "correct" not in el["options"][1]


def test_correct_answer_kwarg_maps_to_wire_key():
    el = fields.Text("river", label="Longest river?", correct_answer="Nile")
    assert el["correctAnswer"] == "Nile"
    assert "correct_answer" not in el


def test_feedback_passthrough():
    el = fields.Text("q", correct_answer="a", feedback={"correct": "Yes!", "incorrect": "No"})
    assert el["feedback"] == {"correct": "Yes!", "incorrect": "No"}


def test_outcome_and_quiz_settings_helpers():
    outcome = fields.Outcome(min=6, max=10, message="Pass", redirect_url="/done")
    assert outcome == {"min": 6, "max": 10, "message": "Pass", "redirectUrl": "/done"}

    settings = fields.Quiz(outcomes=[outcome])
    assert settings["quizMode"] is True
    assert settings["showCorrectAnswers"] is True
    assert settings["outcomes"] == [outcome]


def test_full_quiz_form_shape():
    form = Form("exam", title="Exam")
    form.settings(**fields.Quiz(outcomes=[fields.Outcome(min=2, max=99, message="Pass")]))
    form.add(
        fields.SingleChoice(
            "capital",
            label="Capital of France?",
            options=[fields.Option("paris", "Paris", correct=True), fields.Option("lyon", "Lyon")],
            points=2,
        ),
        fields.Text("river", label="Longest river?", correct_answer="Nile"),
    )
    data = form.to_dict()
    assert data["settings"]["quizMode"] is True
    q1 = data["pages"][0]["elements"][0]
    assert q1["points"] == 2 and q1["options"][0]["correct"] is True
    assert data["pages"][0]["elements"][1]["correctAnswer"] == "Nile"

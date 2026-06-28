# Quizzes & Assessments

Supform forms can be graded quizzes — auto-scored, with per-question feedback, a respondent
results screen, and score analytics in the dashboard. Everything is **additive**: a form is a
quiz only when `settings.quizMode` is on, and existing forms are unaffected.

## Turn on quiz mode

In the builder: **Settings → Quiz → Score answers (quiz mode)**. Or in a schema/SDK:

```python
from supform_sdk import Form, fields

form = Form("exam", title="Pop quiz")
form.settings(**fields.Quiz(outcomes=[
    fields.Outcome(min=0, max=2, message="Keep studying"),
    fields.Outcome(min=3, max=5, message="You passed!"),
]))
```

## Two ways to grade

### 1. Correct answers (auto-graded)

Mark the right answer and (optionally) the points it's worth.

- **Choice questions** — tick the ✓ box next to the correct option(s) in the builder's
  *Choices* editor, or set `correct: true` on the option. Multi-select is correct only when the
  chosen set matches the flagged options exactly.
- **Text / number questions** — set a **Correct answer** in the question's *Quiz* section
  (`correctAnswer`). Text is matched case-insensitively after trimming.
- **Points** default to `1`; override per question.
- **Feedback** — optional `correct` / `incorrect` messages shown on the results screen.

```python
form.add(
    fields.SingleChoice("capital", label="Capital of France?", points=2,
        options=[fields.Option("paris", "Paris", correct=True), fields.Option("lyon", "Lyon")],
        feedback={"correct": "Oui!", "incorrect": "It's Paris."}),
    fields.Text("river", label="Longest river?", correct_answer="Nile"),
)
```

### 2. Option scores + outcomes (weighted / personality)

Give options a numeric `score` (no "correct" answer); the sum maps to an `outcome` band's
message. Great for "what type are you" quizzes and weighted self-assessments.

```python
fields.SingleChoice("mood", options=[
    fields.Option("great", score=3), fields.Option("ok", score=1), fields.Option("bad", score=0),
])
```

The two models compose: outcome bands match on **earned points** when a form has correct-answer
questions, otherwise on the additive option score.

## What respondents see

On submit, the thank-you screen shows the score (`earned / max`, correct count) and — unless you
turn off **Show respondents their graded results** (`showCorrectAnswers: false`) — a per-question
breakdown: a correct/incorrect mark, their answer, the correct answer, and any feedback. Scoring
is always computed **server-side**, so a respondent can't inflate their own result.

## What you see (dashboard)

The responses table gains a **Score** column, and the analytics tab adds:
- **Scores** — average / median / min / max, a score distribution, and pass-rate by outcome band.
- **Correct rate by question** — how many respondents got each question right.

Quiz scores also flow into CSV/XLSX exports (the `_score` column).

## Implementation notes

- Schema contract: `Choice.correct`, `Element.points` / `correctAnswer` / `feedback`,
  `settings.quizMode` / `showCorrectAnswers` / `outcomes` — defined in all four contract files
  (`packages/form-schema`, backend Pydantic, frontend TS, SDK).
- Grading engine: [`backend/app/form_engine/scoring.py`](../backend/app/form_engine/scoring.py)
  (`grade_submission`), wired in [`services/submissions.py`](../backend/app/services/submissions.py).
- Client mirror for preview: [`frontend/src/features/renderer/grade.ts`](../frontend/src/features/renderer/grade.ts).

import type { GradingResult } from "@/api/client";
import type { Element, FormSchema, I18nString } from "@/types/form-schema";

type Localize = (value: I18nString | undefined) => string;

/** Human label for a single answer value (resolving choice option labels where present). */
function labelForValue(el: Element, value: unknown, L: Localize): string {
  const opt = (el.options ?? []).find((o) => o.value === value);
  if (opt) return L(opt.label) || String(opt.value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** Human text for an answer (joins multi-select values). */
function answerText(el: Element, value: unknown, L: Localize): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) {
    return value.length ? value.map((v) => labelForValue(el, v, L)).join(", ") : "—";
  }
  return labelForValue(el, value, L);
}

/**
 * Graded results shown to the respondent on the thank-you screen (quiz mode, opt-out via
 * `settings.showCorrectAnswers`). Lists each graded question with a correct/incorrect mark,
 * the respondent's answer, the correct answer (when wrong), and any per-question feedback.
 */
export function QuizResults({
  schema,
  answers,
  grading,
  L,
}: {
  schema: FormSchema;
  answers: Record<string, unknown>;
  grading: GradingResult;
  L: Localize;
}) {
  const graded: Element[] = [];
  const collect = (els: Element[]) => {
    for (const el of els) {
      if (grading.perField[el.name]) graded.push(el);
      if (el.elements) collect(el.elements);
    }
  };
  for (const p of schema.pages) collect(p.elements);

  return (
    <div className="quiz-results">
      <p className="quiz-score">
        Your score: <strong>{grading.earnedPoints}</strong> / {grading.maxPoints}{" "}
        <span className="quiz-score-sub">
          ({grading.correctCount} of {grading.gradedCount} correct)
        </span>
      </p>
      <ul className="quiz-results-list">
        {graded.map((el) => {
          const fg = grading.perField[el.name];
          const feedback = fg.correct ? el.feedback?.correct : el.feedback?.incorrect;
          return (
            <li key={el.name} className={`quiz-result ${fg.correct ? "correct" : "incorrect"}`}>
              <div className="quiz-result-head">
                <span className="quiz-result-mark" aria-hidden="true">
                  {fg.correct ? "✓" : "✗"}
                </span>
                <span className="quiz-result-q">{L(el.label) || el.name}</span>
                <span className="quiz-result-pts">
                  {fg.earned}/{fg.points}
                </span>
              </div>
              <div className="quiz-result-detail">
                <span>Your answer: {answerText(el, answers[el.name], L)}</span>
                {!fg.correct && fg.correctAnswer.length > 0 && (
                  <span className="quiz-result-correct">
                    Correct: {fg.correctAnswer.map((v) => labelForValue(el, v, L)).join(", ")}
                  </span>
                )}
              </div>
              {feedback && <p className="quiz-result-feedback">{L(feedback)}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"""The form engine: the brain that gives the JSON form schema behavior.

- ``expressions``  — safe evaluation of logic strings (visibleIf / calculate / validation)
- ``schema``       — validate that a form definition is well-formed and consistent
- ``submissions``  — validate a submission's answers against a form version
"""

from app.form_engine.expressions import ExpressionError, evaluate
from app.form_engine.schema import SchemaIssue, validate_form
from app.form_engine.scoring import compute_score, grade_submission, match_outcome
from app.form_engine.submissions import SubmissionValidationResult, validate_submission

__all__ = [
    "evaluate",
    "ExpressionError",
    "validate_form",
    "SchemaIssue",
    "validate_submission",
    "SubmissionValidationResult",
    "compute_score",
    "grade_submission",
    "match_outcome",
]

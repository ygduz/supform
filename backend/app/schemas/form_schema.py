"""Pydantic models for the Supform **Form Schema**.

This is the Python mirror of ``packages/form-schema/schema/form.schema.json`` and is the
authoritative in-code representation of a form. The form engine validates definitions and
submissions against these models. Keep this file and the JSON Schema in lock-step.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# An i18n string is either a plain string or a {locale: text} map.
I18nString = str | dict[str, str]


class ElementType(StrEnum):
    """Core element types. The set is intentionally open — the engine tolerates unknown
    types (treated as generic value fields) so the platform stays flexible."""

    # text-ish
    TEXT = "text"
    LONGTEXT = "longtext"
    EMAIL = "email"
    URL = "url"
    PHONE = "phone"
    # numeric
    NUMBER = "number"
    INTEGER = "integer"
    DECIMAL = "decimal"
    # choice
    SINGLE_CHOICE = "single_choice"
    MULTI_CHOICE = "multi_choice"
    DROPDOWN = "dropdown"
    RANKING = "ranking"
    RATING = "rating"
    SCALE = "scale"
    # date/time/bool
    DATE = "date"
    TIME = "time"
    DATETIME = "datetime"
    DATE_RANGE = "date_range"
    BOOLEAN = "boolean"
    # complex
    MATRIX = "matrix"
    GROUP = "group"
    REPEAT = "repeat"
    # media
    FILE = "file"
    IMAGE = "image"
    SIGNATURE = "signature"
    ADDRESS = "address"
    GEOPOINT = "geopoint"
    GEOTRACE = "geotrace"
    GEOSHAPE = "geoshape"
    BARCODE = "barcode"
    # metadata auto-capture (invisible to respondents, filled server-side)
    START = "start"
    END = "end"
    TODAY = "today"
    DEVICEID = "deviceid"
    USERNAME = "username"
    # derived / layout
    CALCULATED = "calculated"
    HIDDEN = "hidden"
    NOTE = "note"
    SECTION = "section"
    HTML = "html"


class Choice(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    value: str | int | float | bool
    label: I18nString | None = None
    visible_if: str | None = Field(default=None, alias="visibleIf")
    score: float | None = None  # points awarded when chosen (quiz mode)
    correct: bool | None = None  # marks a correct answer (quiz mode grading)
    meta: dict[str, Any] = Field(default_factory=dict)


class Feedback(BaseModel):
    """Quiz mode: messages shown on the results screen after grading a question."""

    model_config = ConfigDict(extra="forbid")

    correct: I18nString | None = None
    incorrect: I18nString | None = None


class Outcome(BaseModel):
    """A scored-result band: shown on the thank-you screen when score is in [min, max]."""

    model_config = ConfigDict(populate_by_name=True)

    min: float
    max: float
    message: I18nString
    redirect_url: str | None = Field(default=None, alias="redirectUrl")


class Validation(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    min: float | None = None
    max: float | None = None
    min_length: int | None = Field(default=None, alias="minLength")
    max_length: int | None = Field(default=None, alias="maxLength")
    pattern: str | None = None
    min_selected: int | None = Field(default=None, alias="minSelected")
    max_selected: int | None = Field(default=None, alias="maxSelected")
    expression: str | None = None
    message: I18nString | None = None


class RepeatSettings(BaseModel):
    min: int = 0
    max: int | None = None
    add_button_text: I18nString | None = Field(default=None, alias="addButtonText")
    entry_label: I18nString | None = Field(default=None, alias="entryLabel")


class Element(BaseModel):
    """A field, layout block, group, or repeat. ``type`` drives behavior."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    type: str
    name: str
    label: I18nString | None = None
    hint: I18nString | None = None
    placeholder: I18nString | None = None
    default_value: Any | None = Field(default=None, alias="defaultValue")
    required: bool = False
    read_only: bool = Field(default=False, alias="readOnly")

    # Logic (expressions evaluated by app.form_engine.expressions)
    visible_if: str | None = Field(default=None, alias="visibleIf")
    enable_if: str | None = Field(default=None, alias="enableIf")
    required_if: str | None = Field(default=None, alias="requiredIf")
    calculate: str | None = None

    validation: Validation | None = None

    # choices / matrix
    options: list[Choice] | None = None
    options_from: str | None = Field(default=None, alias="optionsFrom")
    rows: list[Choice] | None = None
    columns: list[Choice] | None = None

    # nesting
    elements: list[Element] | None = None
    repeat: RepeatSettings | None = None

    # quiz grading (see app.form_engine.scoring)
    points: float | None = None  # points for a correct answer (default 1 when graded)
    correct_answer: bool | int | float | str | list[Any] | None = Field(
        default=None, alias="correctAnswer"
    )
    feedback: Feedback | None = None

    meta: dict[str, Any] = Field(default_factory=dict)


class NextPageRule(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    condition: str
    page: str


class Page(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    name: str
    title: I18nString | None = None
    description: I18nString | None = None
    visible_if: str | None = Field(default=None, alias="visibleIf")
    next_page_if: list[NextPageRule] = Field(default_factory=list, alias="nextPageIf")
    elements: list[Element] = Field(default_factory=list)


class Theme(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    preset: str = "supform-light"
    primary_color: str | None = Field(default=None, alias="primaryColor")
    background_color: str | None = Field(default=None, alias="backgroundColor")
    font_family: str | None = Field(default=None, alias="fontFamily")
    corner_radius: int | None = Field(default=None, alias="cornerRadius")
    cover_image: str | None = Field(default=None, alias="coverImage")
    logo: str | None = None


class QualityChecks(BaseModel):
    """Thresholds for automated data-quality flags computed at submission time."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    min_duration_seconds: int | None = Field(default=None, alias="minDurationSeconds")
    expected_geo_bbox: list[float] | None = Field(default=None, alias="expectedGeoBbox")


class FormSettings(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    display_mode: str = Field(default="paged", alias="displayMode")
    show_progress_bar: bool = Field(default=True, alias="showProgressBar")
    shuffle_questions: bool = Field(default=False, alias="shuffleQuestions")
    shuffle_options: bool = Field(default=False, alias="shuffleOptions")
    allow_multiple_submissions: bool = Field(default=True, alias="allowMultipleSubmissions")
    require_login: bool = Field(default=False, alias="requireLogin")
    accepting_responses: bool = Field(default=True, alias="acceptingResponses")
    open_date: str | None = Field(default=None, alias="openDate")
    close_date: str | None = Field(default=None, alias="closeDate")
    max_responses: int | None = Field(default=None, alias="maxResponses")
    submit_button_text: I18nString | None = Field(default=None, alias="submitButtonText")
    confirmation_title: I18nString | None = Field(default=None, alias="confirmationTitle")
    confirmation_message: I18nString | None = Field(default=None, alias="confirmationMessage")
    welcome_title: I18nString | None = Field(default=None, alias="welcomeTitle")
    welcome_message: I18nString | None = Field(default=None, alias="welcomeMessage")
    redirect_url: str | None = Field(default=None, alias="redirectUrl")
    notify_emails: list[str] = Field(default_factory=list, alias="notifyEmails")
    quiz_mode: bool = Field(default=False, alias="quizMode")
    show_correct_answers: bool = Field(default=True, alias="showCorrectAnswers")
    workflow_steps: list[str] = Field(default_factory=list, alias="workflowSteps")
    outcomes: list[Outcome] = Field(default_factory=list)
    # Data quality: thresholds for automated flag checks run at submit time.
    quality_checks: QualityChecks | None = Field(default=None, alias="qualityChecks")


class FormSchema(BaseModel):
    """The full form definition."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    schema_version: str = Field(default="1.0", alias="schemaVersion")
    id: str | None = None
    name: str
    title: I18nString
    description: I18nString | None = None
    version: int = 1
    default_language: str = Field(default="en", alias="defaultLanguage")
    languages: list[str] = Field(default_factory=list)
    theme: Theme = Field(default_factory=Theme)
    settings: FormSettings = Field(default_factory=FormSettings)
    pages: list[Page] = Field(default_factory=list)

    # ---- convenience ----
    def iter_elements(self) -> list[Element]:
        """Flatten all elements (recursing into groups/repeats)."""
        out: list[Element] = []

        def _walk(elements: list[Element]) -> None:
            for el in elements:
                out.append(el)
                if el.elements:
                    _walk(el.elements)

        for page in self.pages:
            _walk(page.elements)
        return out

    def field_names(self) -> set[str]:
        return {el.name for el in self.iter_elements()}


Element.model_rebuild()

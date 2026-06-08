"""Pydantic models for the Supform **Form Schema**.

This is the Python mirror of ``packages/form-schema/schema/form.schema.json`` and is the
authoritative in-code representation of a form. The form engine validates definitions and
submissions against these models. Keep this file and the JSON Schema in lock-step.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Union

from pydantic import BaseModel, ConfigDict, Field

# An i18n string is either a plain string or a {locale: text} map.
I18nString = Union[str, dict[str, str]]


class ElementType(str, Enum):
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
    BOOLEAN = "boolean"
    # complex
    MATRIX = "matrix"
    GROUP = "group"
    REPEAT = "repeat"
    # media
    FILE = "file"
    IMAGE = "image"
    SIGNATURE = "signature"
    GEOPOINT = "geopoint"
    BARCODE = "barcode"
    # derived / layout
    CALCULATED = "calculated"
    NOTE = "note"
    SECTION = "section"
    HTML = "html"


class Choice(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str | int | float | bool
    label: I18nString | None = None
    visible_if: str | None = Field(default=None, alias="visibleIf")
    meta: dict[str, Any] = Field(default_factory=dict)


class Validation(BaseModel):
    model_config = ConfigDict(extra="forbid")

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
    elements: list["Element"] | None = None
    repeat: RepeatSettings | None = None

    meta: dict[str, Any] = Field(default_factory=dict)


class Page(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    name: str
    title: I18nString | None = None
    description: I18nString | None = None
    visible_if: str | None = Field(default=None, alias="visibleIf")
    elements: list[Element] = Field(default_factory=list)


class Theme(BaseModel):
    model_config = ConfigDict(extra="allow")

    preset: str = "supform-light"
    primary_color: str | None = Field(default=None, alias="primaryColor")
    background_color: str | None = Field(default=None, alias="backgroundColor")
    font_family: str | None = Field(default=None, alias="fontFamily")


class FormSettings(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    display_mode: str = Field(default="paged", alias="displayMode")
    show_progress_bar: bool = Field(default=True, alias="showProgressBar")
    allow_multiple_submissions: bool = Field(default=True, alias="allowMultipleSubmissions")
    require_login: bool = Field(default=False, alias="requireLogin")
    submit_button_text: I18nString | None = Field(default=None, alias="submitButtonText")
    confirmation_message: I18nString | None = Field(default=None, alias="confirmationMessage")


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
    def iter_elements(self) -> "list[Element]":
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

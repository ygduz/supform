"""Field builders — friendly constructors that emit Supform schema elements.

Each function returns a plain ``dict`` matching one element of the form schema
(packages/form-schema). Keeping them as functions (not classes) keeps the call sites
terse and the output trivially serializable.
"""

from __future__ import annotations

from typing import Any

Element = dict[str, Any]


# snake_case kwargs that map to camelCase wire keys (quiz grading + builder-v2 passthrough).
_KW_ALIASES = {
    "correct_answer": "correctAnswer",
    "rating_max": "ratingMax",
    "rating_glyph": "ratingGlyph",
    "scale_label_low": "scaleLabelLow",
    "scale_label_high": "scaleLabelHigh",
    "matrix_multi": "matrixMulti",
}


def _base(
    type_: str,
    name: str,
    *,
    label: str | None = None,
    required: bool = False,
    visible_if: str | None = None,
    hint: str | None = None,
    **extra: Any,
) -> Element:
    el: Element = {"type": type_, "name": name}
    if label is not None:
        el["label"] = label
    if required:
        el["required"] = True
    if visible_if:
        el["visibleIf"] = visible_if
    if hint:
        el["hint"] = hint
    for k, v in extra.items():
        if v is not None:
            el[_KW_ALIASES.get(k, k)] = v
    return el


def _options(values: list[Any]) -> list[dict[str, Any]]:
    out = []
    for v in values:
        if isinstance(v, dict):
            out.append(v)
        elif isinstance(v, (tuple, list)) and len(v) == 2:
            out.append({"value": v[0], "label": v[1]})
        else:
            out.append({"value": v, "label": str(v)})
    return out


def Option(
    value: Any,
    label: str | None = None,
    *,
    score: float | None = None,
    correct: bool | None = None,
) -> dict[str, Any]:
    """A choice option, optionally carrying a quiz ``score`` and/or ``correct`` flag.

    Pass these into any choice builder's ``options`` list, e.g.
    ``SingleChoice("q", options=[Option("a", correct=True), Option("b")])``.
    """
    opt: dict[str, Any] = {"value": value}
    if label is not None:
        opt["label"] = label
    if score is not None:
        opt["score"] = score
    if correct is not None:
        opt["correct"] = correct
    return opt


def Outcome(
    *, min: float, max: float, message: str, redirect_url: str | None = None
) -> dict[str, Any]:
    """A quiz outcome band: shown on the thank-you screen when the score is in [min, max]."""
    o: dict[str, Any] = {"min": min, "max": max, "message": message}
    if redirect_url is not None:
        o["redirectUrl"] = redirect_url
    return o


def Quiz(
    *,
    show_correct_answers: bool = True,
    outcomes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return quiz ``settings`` for ``Form(..., settings={**Quiz(...)})``.

    Enables ``quizMode`` and (by default) shows graded results to respondents. Combine with
    per-question ``points`` / ``correctAnswer`` / ``feedback`` and per-``Option`` ``correct`` flags.
    """
    s: dict[str, Any] = {"quizMode": True, "showCorrectAnswers": show_correct_answers}
    if outcomes:
        s["outcomes"] = list(outcomes)
    return s


def Text(name: str, *, max_length: int | None = None, **kw: Any) -> Element:
    validation = {"maxLength": max_length} if max_length else None
    return _base("text", name, validation=validation, **kw)


def LongText(name: str, **kw: Any) -> Element:
    return _base("longtext", name, **kw)


def Email(name: str, **kw: Any) -> Element:
    return _base("email", name, **kw)


def Number(name: str, *, min: float | None = None, max: float | None = None, **kw: Any) -> Element:
    validation = {k: v for k, v in {"min": min, "max": max}.items() if v is not None} or None
    return _base("number", name, validation=validation, **kw)


def Integer(name: str, *, min: int | None = None, max: int | None = None, **kw: Any) -> Element:
    validation = {k: v for k, v in {"min": min, "max": max}.items() if v is not None} or None
    return _base("integer", name, validation=validation, **kw)


def SingleChoice(name: str, *, options: list[Any], **kw: Any) -> Element:
    return _base("single_choice", name, options=_options(options), **kw)


def MultiChoice(name: str, *, options: list[Any], **kw: Any) -> Element:
    return _base("multi_choice", name, options=_options(options), **kw)


def Dropdown(name: str, *, options: list[Any], **kw: Any) -> Element:
    return _base("dropdown", name, options=_options(options), **kw)


def Rating(
    name: str,
    *,
    scale: int = 5,
    rating_glyph: str | None = None,
    **kw: Any,
) -> Element:
    """`rating_glyph`: "star" (default look) or "number". `scale` also sets `ratingMax`."""
    return _base(
        "rating",
        name,
        options=_options(list(range(1, scale + 1))),
        rating_max=scale,
        rating_glyph=rating_glyph,
        **kw,
    )


def Date(name: str, **kw: Any) -> Element:
    return _base("date", name, **kw)


def DateRange(name: str, **kw: Any) -> Element:
    """A date-range question (start + end dates stored as {start, end})."""
    return _base("date_range", name, **kw)


def DateTime(name: str, **kw: Any) -> Element:
    """A combined date-and-time question."""
    return _base("datetime", name, **kw)


def Boolean(name: str, **kw: Any) -> Element:
    return _base("boolean", name, **kw)


def Signature(name: str, **kw: Any) -> Element:
    """A freehand signature capture question."""
    return _base("signature", name, **kw)


def Image(name: str, **kw: Any) -> Element:
    """An image upload question."""
    return _base("image", name, **kw)


def Address(name: str, **kw: Any) -> Element:
    """A structured address question (street, city, state, zip, country)."""
    return _base("address", name, **kw)


def Calculated(name: str, *, calculate: str, **kw: Any) -> Element:
    return _base("calculated", name, calculate=calculate, readOnly=True, **kw)


def Barcode(name: str, **kw: Any) -> Element:
    """A barcode / QR-code scan question."""
    return _base("barcode", name, **kw)


def Decimal(name: str, *, min: float | None = None, max: float | None = None, **kw: Any) -> Element:
    validation = {k: v for k, v in {"min": min, "max": max}.items() if v is not None} or None
    return _base("decimal", name, validation=validation, **kw)


def File(name: str, **kw: Any) -> Element:
    """A file-upload question."""
    return _base("file", name, **kw)


def Geopoint(name: str, **kw: Any) -> Element:
    """A single GPS point capture question."""
    return _base("geopoint", name, **kw)


def Geoshape(name: str, **kw: Any) -> Element:
    """A polygon / area capture question."""
    return _base("geoshape", name, **kw)


def Geotrace(name: str, **kw: Any) -> Element:
    """A GPS trace (line) capture question."""
    return _base("geotrace", name, **kw)


def Group(name: str, *, elements: list[Element], **kw: Any) -> Element:
    return _base("group", name, elements=elements, **kw)


def Hidden(name: str, *, default_value: Any = None, **kw: Any) -> Element:
    """A hidden field — never shown to the respondent; carries a default value."""
    return _base("hidden", name, defaultValue=default_value, **kw)


def Html(name: str, *, label: str, **kw: Any) -> Element:
    """A read-only HTML content block displayed to the respondent."""
    return _base("html", name, label=label, **kw)


def Matrix(
    name: str,
    *,
    rows: list[Any],
    columns: list[Any],
    matrix_multi: bool | None = None,
    **kw: Any,
) -> Element:
    """A matrix / grid question with labelled rows and columns.

    `matrix_multi=True` allows multiple selections per row (checkbox cells instead of radio).
    """
    return _base(
        "matrix",
        name,
        rows=_options(rows),
        columns=_options(columns),
        matrix_multi=matrix_multi,
        **kw,
    )


def Note(name: str, *, label: str, **kw: Any) -> Element:
    return _base("note", name, label=label, **kw)


def Phone(name: str, **kw: Any) -> Element:
    """A phone-number input question."""
    return _base("phone", name, **kw)


def Ranking(name: str, *, options: list[Any], **kw: Any) -> Element:
    """A drag-to-rank question."""
    return _base("ranking", name, options=_options(options), **kw)


def Scale(
    name: str,
    *,
    min: int = 1,
    max: int = 5,
    scale_label_low: str | None = None,
    scale_label_high: str | None = None,
    **kw: Any,
) -> Element:
    """A numeric scale question rendered as a labelled slider or button row.

    `scale_label_low`/`scale_label_high` caption the endpoints (e.g. "Not likely"/"Very
    likely"); the bounds themselves come from `min`/`max`, stored as `validation.min`/`max`.
    """
    validation = {"min": min, "max": max}
    return _base(
        "scale",
        name,
        options=_options(list(range(min, max + 1))),
        validation=validation,
        scale_label_low=scale_label_low,
        scale_label_high=scale_label_high,
        **kw,
    )


def Section(name: str, *, label: str, **kw: Any) -> Element:
    """A visual section-divider / heading block."""
    return _base("section", name, label=label, **kw)


def Time(name: str, **kw: Any) -> Element:
    """A time-only question."""
    return _base("time", name, **kw)


def Url(name: str, **kw: Any) -> Element:
    """A URL input question."""
    return _base("url", name, **kw)


def QualityChecks(
    *,
    min_duration_seconds: int | None = None,
    expected_geo_bbox: tuple[float, float, float, float] | None = None,
) -> dict[str, Any]:
    """Return a ``qualityChecks`` settings dict for use in ``Form(..., settings={...})``."""
    qc: dict[str, Any] = {}
    if min_duration_seconds is not None:
        qc["minDurationSeconds"] = min_duration_seconds
    if expected_geo_bbox is not None:
        qc["expectedGeoBbox"] = list(expected_geo_bbox)
    return qc


def Repeat(
    name: str,
    *,
    elements: list[Element],
    min: int = 0,
    max: int | None = None,
    entry_label: str | None = None,
    add_button_text: str | None = None,
    **kw: Any,
) -> Element:
    repeat: dict[str, Any] = {"min": min}
    if max is not None:
        repeat["max"] = max
    if entry_label is not None:
        repeat["entryLabel"] = entry_label
    if add_button_text is not None:
        repeat["addButtonText"] = add_button_text
    return _base("repeat", name, elements=elements, repeat=repeat, **kw)

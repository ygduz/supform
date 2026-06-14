"""Field builders — friendly constructors that emit Supform schema elements.

Each function returns a plain ``dict`` matching one element of the form schema
(packages/form-schema). Keeping them as functions (not classes) keeps the call sites
terse and the output trivially serializable.
"""

from __future__ import annotations

from typing import Any

Element = dict[str, Any]


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
    el.update({k: v for k, v in extra.items() if v is not None})
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


def Rating(name: str, *, scale: int = 5, **kw: Any) -> Element:
    return _base("rating", name, options=_options(list(range(1, scale + 1))), **kw)


def Date(name: str, **kw: Any) -> Element:
    return _base("date", name, **kw)


def Boolean(name: str, **kw: Any) -> Element:
    return _base("boolean", name, **kw)


def Calculated(name: str, *, calculate: str, **kw: Any) -> Element:
    return _base("calculated", name, calculate=calculate, readOnly=True, **kw)


def Note(name: str, *, label: str, **kw: Any) -> Element:
    return _base("note", name, label=label, **kw)


def Group(name: str, *, elements: list[Element], **kw: Any) -> Element:
    return _base("group", name, elements=elements, **kw)


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

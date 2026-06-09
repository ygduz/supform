"""ODK XForm (XML) -> Supform schema importer.

XForm is the compiled XML form ODK Collect / Enketo render (XLSForm compiles down to it).
Supporting direct XForm import lets Supform ingest forms from any ODK tool, not just
spreadsheets.

Structure we read (W3C XForms + JavaRosa):

- ``<h:head><h:title>``            -> form title
- ``<model><instance>``            -> primary data tree (form name = its root tag)
- ``<model><bind nodeset=…>``      -> per-field type + logic (required/relevant/constraint/
                                      calculate/readonly)
- ``<model><itext>``               -> label translations referenced by ``jr:itext('id')``
- ``<h:body>`` controls            -> the questions: input / select1 / select / upload /
                                      group / repeat / trigger

XPath relevance/constraint/calculate expressions are translated to Supform's grammar on a
best-effort basis (instance paths like ``/data/age`` collapse to ``age``; ``.`` -> ``value``;
``=`` -> ``==``; ``div``/``mod`` -> ``/``/``%``; ``true()``/``false()`` -> ``True``/``False``).
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Any

from app.schemas.form_schema import FormSchema

# XForm bind type -> Supform element type. select1/select handled via body controls.
_TYPE_MAP: dict[str, str] = {
    "string": "text",
    "int": "integer",
    "integer": "integer",
    "decimal": "decimal",
    "date": "date",
    "time": "time",
    "datetime": "datetime",
    "geopoint": "geopoint",
    "geotrace": "geopoint",
    "geoshape": "geopoint",
    "barcode": "barcode",
    "boolean": "boolean",
    "binary": "file",
}

Bind = dict[str, Any]


def import_xform(xml: str | bytes) -> FormSchema:
    """Parse ODK XForm XML into a :class:`FormSchema`."""
    root = ET.fromstring(xml.encode() if isinstance(xml, str) else xml)

    head = _find(root, "head")
    body = _find(root, "body")
    model = _find(head, "model") if head is not None else None
    if model is None or body is None:
        raise ValueError("Not an XForm: missing <model> or <body>.")

    binds = _read_binds(model)
    itext, languages, default_lang = _read_itext(model)
    title = _text(_find(head, "title")) or "Imported form"
    form_name = _form_name(model)

    elements = [el for child in body for el in _control(child, binds, itext, default_lang) if el]
    _append_orphan_calculates(elements, binds)

    form: dict[str, Any] = {
        "schemaVersion": "1.0",
        "name": _slug(form_name),
        "title": title,
        "defaultLanguage": default_lang,
        "pages": [{"name": "page1", "elements": elements}],
    }
    if len(languages) > 1:
        form["languages"] = sorted(languages)
    return FormSchema.model_validate(form)


# ----------------------------------------------------------------- model: binds
def _read_binds(model: ET.Element) -> dict[str, Bind]:
    binds: dict[str, Bind] = {}
    for b in _find_all(model, "bind"):
        nodeset = b.get("nodeset") or b.get("ref")
        if not nodeset:
            continue
        binds[nodeset] = {
            "type": (b.get("type") or "").split(":")[-1],
            "required": _truthy(b.get("required")),
            "relevant": b.get("relevant"),
            "constraint": b.get("constraint"),
            "constraint_msg": _attr_ns(b, "constraintMsg"),
            "calculate": b.get("calculate"),
            "readonly": _truthy(b.get("readonly")),
            "name": nodeset.rsplit("/", 1)[-1],
        }
    return binds


def _read_itext(model: ET.Element) -> tuple[dict[str, dict[str, str]], set[str], str]:
    """Return ({text_id: {lang: value}}, languages, default_language)."""
    itext_el = _find(model, "itext")
    translations: dict[str, dict[str, str]] = {}
    languages: set[str] = set()
    default_lang = "en"
    if itext_el is None:
        return translations, {default_lang}, default_lang

    first_lang: str | None = None
    for tr in _find_all(itext_el, "translation"):
        lang = tr.get("lang") or "en"
        languages.add(lang)
        first_lang = first_lang or lang
        if _truthy(tr.get("default")):
            default_lang = lang
        for text in _find_all(tr, "text"):
            text_id = text.get("id")
            value = _text(_find(text, "value"))
            if text_id and value is not None:
                translations.setdefault(text_id, {})[lang] = value
    if not _truthy_default_present(itext_el):
        default_lang = first_lang or default_lang
    return translations, (languages or {default_lang}), default_lang


# ----------------------------------------------------------------- body: controls
def _control(
    node: ET.Element,
    binds: dict[str, Bind],
    itext: dict[str, dict[str, str]],
    default_lang: str,
) -> list[dict[str, Any]]:
    tag = _local(node.tag)

    if tag == "group":
        return [_container(node, "group", binds, itext, default_lang)]
    if tag == "repeat":
        el = _container(node, "repeat", binds, itext, default_lang, ref_attr="nodeset")
        el["repeat"] = {"min": 0}
        return [el]
    if tag in ("input", "select1", "select", "upload", "trigger", "range"):
        field = _field(node, tag, binds, itext, default_lang)
        return [field] if field else []
    # Unknown wrappers (e.g. odk:rank) — descend so we don't lose nested controls.
    out: list[dict[str, Any]] = []
    for child in node:
        out.extend(_control(child, binds, itext, default_lang))
    return out


def _container(
    node: ET.Element,
    kind: str,
    binds: dict[str, Bind],
    itext: dict[str, dict[str, str]],
    default_lang: str,
    *,
    ref_attr: str = "ref",
) -> dict[str, Any]:
    ref = node.get(ref_attr) or node.get("ref") or kind
    el: dict[str, Any] = {"type": kind, "name": _slug(ref.rsplit("/", 1)[-1]), "elements": []}
    label = _label(node, itext, default_lang)
    if label is not None:
        el["label"] = label
    _apply_logic(el, binds.get(ref))
    for child in node:
        if _local(child.tag) == "label":
            continue
        el["elements"].extend(_control(child, binds, itext, default_lang))
    # A group that only wraps a repeat (common XLSForm output) collapses to the repeat.
    if kind == "group" and len(el["elements"]) == 1 and el["elements"][0]["type"] == "repeat":
        return el["elements"][0]
    return el


def _field(
    node: ET.Element,
    tag: str,
    binds: dict[str, Bind],
    itext: dict[str, dict[str, str]],
    default_lang: str,
) -> dict[str, Any] | None:
    ref = node.get("ref") or node.get("bind")
    if not ref:
        return None
    bind = binds.get(ref, {})
    name = _slug(bind.get("name") or ref.rsplit("/", 1)[-1])
    el: dict[str, Any] = {"name": name}

    label = _label(node, itext, default_lang)
    if label is not None:
        el["label"] = label
    hint = _hint(node, itext, default_lang)
    if hint is not None:
        el["hint"] = hint

    if tag in ("select1", "select"):
        el["type"] = "single_choice" if tag == "select1" else "multi_choice"
        el["options"] = _items(node, itext, default_lang)
    elif tag == "upload":
        el["type"] = "image" if (node.get("mediatype") or "").startswith("image") else "file"
    elif tag == "trigger":
        el["type"] = "note"
    else:  # input / range
        btype = bind.get("type", "string")
        el["type"] = "scale" if tag == "range" else _TYPE_MAP.get(btype, "text")

    if bind.get("calculate"):
        el["calculate"] = _translate(bind["calculate"])
        el["type"] = "calculated"
        el["readOnly"] = True

    _apply_logic(el, bind)
    return el


def _items(
    node: ET.Element, itext: dict[str, dict[str, str]], default_lang: str
) -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = []
    for item in _find_all(node, "item"):
        value = _text(_find(item, "value"))
        if value is None:
            continue
        choice: dict[str, Any] = {"value": value}
        label = _label(item, itext, default_lang)
        if label is not None:
            choice["label"] = label
        options.append(choice)
    return options


def _apply_logic(el: dict[str, Any], bind: Bind | None) -> None:
    if not bind:
        return
    if bind.get("required"):
        el["required"] = True
    if bind.get("readonly") and el.get("type") not in ("note", "calculated"):
        el["readOnly"] = True
    if bind.get("relevant"):
        el["visibleIf"] = _translate(bind["relevant"])
    if bind.get("constraint"):
        validation: dict[str, Any] = {"expression": _translate(bind["constraint"])}
        if bind.get("constraint_msg"):
            validation["message"] = bind["constraint_msg"]
        el["validation"] = validation


def _append_orphan_calculates(elements: list[dict[str, Any]], binds: dict[str, Bind]) -> None:
    """Emit calculated fields for ``calculate`` binds that have no body control (hidden)."""
    present = {e["name"] for e in _walk(elements)}
    for bind in binds.values():
        if bind.get("calculate") and bind["name"] not in present:
            elements.append(
                {
                    "type": "calculated",
                    "name": _slug(bind["name"]),
                    "calculate": _translate(bind["calculate"]),
                    "readOnly": True,
                }
            )


# ----------------------------------------------------------------- labels / itext
def _label(node: ET.Element, itext: dict[str, dict[str, str]], default_lang: str) -> Any:
    return _resolve_ref_text(_find(node, "label"), itext, default_lang)


def _hint(node: ET.Element, itext: dict[str, dict[str, str]], default_lang: str) -> Any:
    return _resolve_ref_text(_find(node, "hint"), itext, default_lang)


def _resolve_ref_text(
    el: ET.Element | None, itext: dict[str, dict[str, str]], default_lang: str
) -> Any:
    if el is None:
        return None
    ref = el.get("ref")
    if ref:
        match = re.search(r"itext\('([^']+)'\)", ref)
        if match:
            translations = itext.get(match.group(1))
            if translations:
                return translations if len(translations) > 1 else next(iter(translations.values()))
    return _text(el)


# ----------------------------------------------------------------- XML helpers
def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _find(parent: ET.Element | None, name: str) -> ET.Element | None:
    if parent is None:
        return None
    for child in parent.iter():
        if _local(child.tag) == name:
            return child
    return None


def _find_all(parent: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in parent.iter() if _local(child.tag) == name]


def _text(el: ET.Element | None) -> str | None:
    if el is None or el.text is None:
        return None
    text = el.text.strip()
    return text or None


def _attr_ns(el: ET.Element, local: str) -> str | None:
    for key, value in el.attrib.items():
        if _local(key) == local:
            return value
    return None


def _form_name(model: ET.Element) -> str:
    instance = _find(model, "instance")
    if instance is not None:
        for child in instance:
            ident = child.get("id")
            return ident or _local(child.tag)
    return "imported_form"


def _truthy_default_present(itext_el: ET.Element) -> bool:
    return any(_truthy(tr.get("default")) for tr in _find_all(itext_el, "translation"))


# ----------------------------------------------------------------- value helpers
_TRUTHY = {"true()", "true", "1", "yes"}


def _truthy(value: Any) -> bool:
    return value is not None and str(value).strip().lower() in _TRUTHY


def _slug(value: Any) -> str:
    s = re.sub(r"[^a-zA-Z0-9_]", "_", str(value).strip())
    if not s:
        s = "field"
    if not re.match(r"[a-zA-Z_]", s[0]):
        s = f"_{s}"
    return s


def _translate(expr: str) -> str:
    """Best-effort translation of an XForm/XPath expression to Supform's grammar."""
    s = expr.strip()
    s = re.sub(r"\$\{([^}]+)\}", lambda m: m.group(1).rsplit("/", 1)[-1], s)  # ${a/b} -> b
    # Absolute instance paths /data/group/field -> field (last segment).
    s = re.sub(r"(?:/[A-Za-z_][\w.-]*)+", lambda m: m.group(0).rsplit("/", 1)[-1], s)
    s = re.sub(r"\btrue\(\)", "True", s)
    s = re.sub(r"\bfalse\(\)", "False", s)
    s = re.sub(r"(?<![\w.])\.(?![\w.])", "value", s)  # current node '.' -> value
    s = re.sub(r"\bdiv\b", "/", s)
    s = re.sub(r"\bmod\b", "%", s)
    s = re.sub(r"(?<![<>=!])=(?!=)", "==", s)  # '=' -> '==' (leave <=,>=,!=,==)
    return s.strip()


def _walk(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for el in elements:
        out.append(el)
        if el.get("elements"):
            out.extend(_walk(el["elements"]))
    return out

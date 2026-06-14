"""OpenRosa / ODK-compatible API for KoboCollect and ODK Collect mobile clients.

Implements the minimum OpenRosa spec (https://docs.getodk.org/openrosa/) so that
Supform forms can be downloaded and submitted via the ODK Collect Android app:

  GET  /openrosa/formList        — XML list of published forms
  GET  /openrosa/forms/{id}.xml  — XForm XML for a single form
  POST /openrosa/submission       — accept a multipart submission from Collect

Authentication follows the same JWT bearer scheme as the rest of the API.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.form_schema import Element, FormSchema
from app.services import forms as forms_service
from app.services import submissions as submissions_service

router = APIRouter(prefix="/openrosa", tags=["openrosa"])

_OR_HEADERS = {
    "X-OpenRosa-Version": "1.0",
    "X-OpenRosa-Accept-Content-Length": "10485760",
    "Date": "",
}

# ── Type mapping: Supform → XForm ────────────────────────────────

_TYPE_MAP: dict[str, str] = {
    "text": "string",
    "longtext": "string",
    "email": "string",
    "phone": "string",
    "url": "string",
    "number": "decimal",
    "integer": "int",
    "decimal": "decimal",
    "date": "date",
    "time": "time",
    "datetime": "dateTime",
    "boolean": "boolean",
    "single_choice": "select1",
    "multi_choice": "select",
    "dropdown": "select1",
    "geopoint": "geopoint",
    "geotrace": "geotrace",
    "geoshape": "geoshape",
    "barcode": "barcode",
    "file": "binary",
    "image": "binary",
    "signature": "binary",
    "note": "string",
    "calculated": "decimal",
}

_CHOICE_TYPES = frozenset(["single_choice", "multi_choice", "dropdown", "ranking"])


def _label(el: Element | FormSchema, fallback: str = "") -> str:
    raw = el.label if hasattr(el, "label") else getattr(el, "title", None)
    if raw is None:
        return fallback
    if isinstance(raw, str):
        return raw
    return next(iter(raw.values()), fallback)


def _esc(s: str) -> str:
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    )


# ── XForm XML generation ──────────────────────────────────────────

def _instance_fields(elements: list[Element], indent: int = 6) -> list[str]:
    pad = " " * indent
    out: list[str] = []
    for el in elements:
        if el.type in ("note", "html", "section"):
            continue
        if el.type in ("group", "repeat"):
            out.append(f"{pad}<{el.name}>")
            out.extend(_instance_fields(el.elements or [], indent + 2))
            out.append(f"{pad}</{el.name}>")
        else:
            out.append(f"{pad}<{el.name}/>")
    return out


def _bind_elements(form_id: str, elements: list[Element], prefix: str = "/data") -> list[str]:
    out: list[str] = []
    for el in elements:
        if el.type in ("note", "html", "section"):
            continue
        path = f"{prefix}/{el.name}"
        if el.type in ("group", "repeat"):
            out.extend(_bind_elements(form_id, el.elements or [], path))
            continue
        xtype = _TYPE_MAP.get(el.type, "string")
        req = ' required="true()"' if el.required else ""
        calc = f' calculate="{_esc(el.calculate)}"' if el.calculate else ""
        relevant = f' relevant="{_esc(el.visible_if)}"' if el.visible_if else ""
        out.append(f'      <bind nodeset="{path}" type="{xtype}"{req}{calc}{relevant}/>')
    return out


def _body_elements(elements: list[Element], choices_used: set[str], indent: int = 4) -> list[str]:
    pad = " " * indent
    out: list[str] = []
    for el in elements:
        if el.type in ("note", "html", "section", "calculated", "start", "end", "today",
                        "deviceid", "username"):
            continue
        ref = f"/data/{el.name}"
        lbl = _esc(_label(el, el.name))

        if el.type == "group":
            out.append(f'{pad}<group ref="{ref}">')
            out.append(f'{pad}  <label>{lbl}</label>')
            out.extend(_body_elements(el.elements or [], choices_used, indent + 2))
            out.append(f'{pad}</group>')

        elif el.type == "repeat":
            out.append(f'{pad}<repeat nodeset="{ref}">')
            out.append(f'{pad}  <label>{lbl}</label>')
            out.extend(_body_elements(el.elements or [], choices_used, indent + 2))
            out.append(f'{pad}</repeat>')

        elif el.type in _CHOICE_TYPES:
            tag = "select" if el.type == "multi_choice" else "select1"
            out.append(f'{pad}<{tag} ref="{ref}">')
            out.append(f'{pad}  <label>{lbl}</label>')
            list_name = f"list_{el.name}"
            choices_used.add(el.name)
            out.append(f'{pad}  <itemset nodeset="instance(\'{list_name}\')/root/item">')
            out.append(f'{pad}    <value ref="value"/>')
            out.append(f'{pad}    <label ref="label"/>')
            out.append(f'{pad}  </itemset>')
            out.append(f'{pad}</{tag}>')

        elif el.type == "geopoint":
            out.append(f'{pad}<input ref="{ref}" appearance="maps">')
            out.append(f'{pad}  <label>{lbl}</label>')
            out.append(f'{pad}</input>')

        elif el.type in ("geotrace", "geoshape"):
            app = "draw" if el.type == "geoshape" else "lines"
            out.append(f'{pad}<input ref="{ref}" appearance="{app}">')
            out.append(f'{pad}  <label>{lbl}</label>')
            out.append(f'{pad}</input>')

        elif el.type in ("file", "image", "signature"):
            out.append(f'{pad}<upload ref="{ref}" mediatype="image/*">')
            out.append(f'{pad}  <label>{lbl}</label>')
            out.append(f'{pad}</upload>')

        elif el.type == "barcode":
            out.append(f'{pad}<input ref="{ref}" appearance="barcode">')
            out.append(f'{pad}  <label>{lbl}</label>')
            out.append(f'{pad}</input>')

        else:
            out.append(f'{pad}<input ref="{ref}">')
            out.append(f'{pad}  <label>{lbl}</label>')
            if el.hint:
                hint_txt = _esc(_label(el, "") if not isinstance(el.hint, str) else el.hint)
                out.append(f'{pad}  <hint>{hint_txt}</hint>')
            out.append(f'{pad}</input>')
    return out


def _choice_instances(elements: list[Element]) -> list[str]:
    out: list[str] = []
    for el in elements:
        if el.type in ("group", "repeat"):
            out.extend(_choice_instances(el.elements or []))
            continue
        if el.type not in _CHOICE_TYPES or not el.options:
            continue
        list_name = f"list_{el.name}"
        out.append(f'    <instance id="{list_name}"><root>')
        for opt in el.options:
            v = _esc(str(opt.value))
            raw_label = opt.label
            if isinstance(raw_label, str):
                lv = _esc(raw_label)
            elif raw_label:
                lv = _esc(next(iter(raw_label.values()), str(opt.value)))
            else:
                lv = _esc(str(opt.value))
            out.append(f'      <item><value>{v}</value><label>{lv}</label></item>')
        out.append("    </root></instance>")
    return out


def _all_elements(schema: FormSchema) -> list[Element]:
    return [el for page in schema.pages for el in page.elements]


def schema_to_xform(form_id: str, schema: FormSchema, base_url: str) -> str:
    elements = _all_elements(schema)
    form_label = _esc(_label(schema, schema.name))
    choices_used: set[str] = set()
    body_lines = _body_elements(elements, choices_used)
    choice_instances = _choice_instances(elements)

    instance_lines = _instance_fields(elements)
    bind_lines = _bind_elements(form_id, elements)

    choice_inst_block = "\n".join(choice_instances)
    instance_block = "\n".join(instance_lines)
    bind_block = "\n".join(bind_lines)
    body_block = "\n".join(body_lines)

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<h:html xmlns="http://www.w3.org/2002/xforms"
        xmlns:h="http://www.w3.org/1999/xhtml"
        xmlns:jr="http://openrosa.org/javarosa"
        xmlns:orx="http://openrosa.org/xforms">
  <h:head>
    <h:title>{form_label}</h:title>
    <model>
      <instance>
        <data id="{form_id}" version="{schema.version}">
{instance_block}
        </data>
      </instance>
{choice_inst_block}
{bind_block}
      <submission action="{base_url}/openrosa/submission" method="post"/>
    </model>
  </h:head>
  <h:body>
{body_block}
  </h:body>
</h:html>"""


# ── Endpoints ─────────────────────────────────────────────────────

@router.get("/formList")
async def form_list(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Return an OpenRosa-compliant XML list of published forms the caller can access."""
    base = str(request.base_url).rstrip("/")
    rows = await forms_service.list_forms(db, user.id)
    published = [(f, c) for f, c in rows if f.current_version is not None]

    items: list[str] = []
    for form, _ in published:
        schema_url = f"{base}/openrosa/forms/{form.id}.xml"
        items.append(
            f'  <xform>\n'
            f'    <formID>{form.id}</formID>\n'
            f'    <name>{_esc(form.title or form.name)}</name>\n'
            f'    <version>{form.current_version}</version>\n'
            f'    <downloadUrl>{schema_url}</downloadUrl>\n'
            f'  </xform>'
        )

    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<xforms xmlns="http://openrosa.org/xforms/xformsList">\n'
        + "\n".join(items)
        + "\n</xforms>"
    )
    return Response(content=body, media_type="text/xml", headers=_OR_HEADERS)


@router.get("/forms/{form_id}.xml")
async def get_xform(
    form_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Return the XForm XML for a published form."""
    base = str(request.base_url).rstrip("/")
    schema = await forms_service.get_published_schema(db, form_id)
    xml = schema_to_xform(str(form_id), schema, base)
    return Response(content=xml, media_type="text/xml", headers=_OR_HEADERS)


@router.post("/submission")
async def receive_submission(
    request: Request,
    xml_submission_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Accept a multipart/form-data submission from ODK / KoboCollect."""
    import xml.etree.ElementTree as ET

    raw = await xml_submission_file.read()
    try:
        root = ET.fromstring(raw.decode("utf-8"))
    except ET.ParseError as exc:
        return Response(
            content=f"<error>{exc}</error>",
            status_code=400,
            media_type="text/xml",
            headers=_OR_HEADERS,
        )

    form_id_str = root.get("id") or root.get("xmlns", "")
    # Strip namespace prefix if present
    form_id_str = re.sub(r"^.*[/:]", "", form_id_str)
    try:
        form_id = uuid.UUID(form_id_str)
    except ValueError:
        return Response(
            content="<error>Cannot determine form id from submission</error>",
            status_code=400,
            media_type="text/xml",
            headers=_OR_HEADERS,
        )

    # Flatten the XML into a flat answers dict (ignores nesting for simplicity).
    def _flatten(el: ET.Element, out: dict[str, Any], prefix: str = "") -> None:
        tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
        if len(el) == 0:
            key = f"{prefix}{tag}" if prefix else tag
            out[key] = el.text or ""
        else:
            for child in el:
                _flatten(child, out, "")

    answers: dict[str, Any] = {}
    _flatten(root, answers)

    try:
        await submissions_service.create_submission(
            db,
            form_id,
            answers,
            respondent_id=user.id,
            respondent_email=user.email,
            source="openrosa",
        )
        await db.commit()
    except Exception as exc:  # noqa: BLE001
        return Response(
            content=f"<error>{_esc(str(exc))}</error>",
            status_code=422,
            media_type="text/xml",
            headers=_OR_HEADERS,
        )

    return Response(
        content='<OpenRosaResponse xmlns="http://openrosa.org/http/response">'
                "<message>Submission accepted</message>"
                "</OpenRosaResponse>",
        status_code=201,
        media_type="text/xml",
        headers=_OR_HEADERS,
    )

"""AI form generation: turn a plain-language prompt into a validated Supform schema.

Pluggable and entirely optional — without ``settings.ai_api_key`` the endpoint reports
"not configured" and nothing here runs. We call an Anthropic-compatible Messages API over
plain httpx (no SDK dependency), then parse and validate the model's JSON against the same
Form Schema contract the builder and SDK use, retrying once with the validation error fed
back so a near-miss can self-correct.
"""

from __future__ import annotations

import json
from typing import Any

from app.core.config import settings
from app.core.exceptions import SupformError
from app.form_engine import validate_form
from app.schemas.form_schema import FormSchema


class AIServiceError(SupformError):
    status_code = 503
    code = "ai_unavailable"


def is_configured() -> bool:
    return bool(settings.ai_api_key)


_SYSTEM_PROMPT = """\
You design forms for Supform. Given a request, output ONE JSON object for the form schema \
and nothing else — no prose, no markdown fences.

Shape:
{
  "schemaVersion": "1.0",
  "name": "snake_case_id",
  "title": "Human title",
  "description": "optional",
  "settings": { "displayMode": "paged" | "single" | "oneQuestionPerScreen" },
  "pages": [ { "name": "page1", "title": "optional", "elements": [ ...fields ] } ]
}

Each field: { "type": ..., "name": "snake_case", "label": "Question?", "required": bool }.
Field types: text, longtext, email, integer, number, decimal, date, time, datetime,
single_choice, multi_choice, dropdown, boolean, scale, rating, matrix, file, geopoint,
note, group, repeat.
Choice fields need "options": [ { "value": "snake_case", "label": "Shown" } ].
rating/scale use numeric option values. matrix needs "rows" and "columns" (option lists).
Use "visibleIf" with simple expressions (e.g. "age >= 18") for conditional fields.
Field "name" values must be unique. Keep it focused and realistic."""


def _build_payload(messages: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "model": settings.ai_model,
        "max_tokens": 4096,
        "system": _SYSTEM_PROMPT,
        "messages": messages,
    }


def _extract_text(response: dict[str, Any]) -> str:
    parts = response.get("content") or []
    return "".join(p.get("text", "") for p in parts if p.get("type") == "text").strip()


def _parse_schema(text: str) -> FormSchema:
    """Parse the model's text into a validated FormSchema (raises ValueError on failure)."""
    body = text.strip()
    if body.startswith("```"):  # tolerate a stray markdown fence
        body = body.split("```", 2)[1]
        body = body[4:].strip() if body.lower().startswith("json") else body.strip()
    start, end = body.find("{"), body.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in the response.")
    data = json.loads(body[start : end + 1])
    schema = FormSchema.model_validate(data)
    issues = [i for i in validate_form(schema) if i.level == "error"]
    if issues:
        raise ValueError("; ".join(f"{i.path}: {i.message}" for i in issues))
    return schema


async def _call_api(messages: list[dict[str, str]]) -> str:
    import httpx

    headers = {
        "x-api-key": settings.ai_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            settings.ai_base_url, headers=headers, json=_build_payload(messages)
        )
        resp.raise_for_status()
        return _extract_text(resp.json())


async def generate_form(prompt: str) -> FormSchema:
    """Generate a validated form schema from a natural-language prompt."""
    if not is_configured():
        raise AIServiceError("AI form generation is not configured on this server.")
    if not prompt.strip():
        raise AIServiceError("Describe the form you want to generate.")

    messages = [{"role": "user", "content": prompt.strip()}]
    try:
        text = await _call_api(messages)
        return _parse_schema(text)
    except ValueError as first_error:
        # One self-correction pass: hand the model its output and the validation error.
        messages += [
            {"role": "assistant", "content": text},
            {
                "role": "user",
                "content": (
                    f"That wasn't valid ({first_error}). Reply with only the corrected "
                    "JSON form schema."
                ),
            },
        ]
        try:
            return _parse_schema(await _call_api(messages))
        except Exception as second_error:  # validation or transport
            raise AIServiceError(
                f"The AI couldn't produce a valid form: {second_error}"
            ) from second_error
    except AIServiceError:
        raise
    except Exception as exc:  # transport / API error on the first attempt
        raise AIServiceError(f"AI request failed: {exc}") from exc

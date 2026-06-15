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
    # A key enables any provider; the OpenAI shape also covers local servers (Ollama,
    # LM Studio, vLLM) that need no key — so it's available whenever that provider is chosen.
    return bool(settings.ai_api_key) or settings.ai_provider == "openai"


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


def _is_openai() -> bool:
    return settings.ai_provider == "openai"


def _request(messages: list[dict[str, str]]) -> tuple[dict[str, str], dict[str, Any]]:
    """Build the (headers, body) for the configured provider's chat API."""
    if _is_openai():
        # OpenAI shape: the system prompt is a leading message; key is optional (local).
        headers = {"content-type": "application/json"}
        if settings.ai_api_key:
            headers["authorization"] = f"Bearer {settings.ai_api_key}"
        body = {
            "model": settings.ai_model,
            "max_tokens": 4096,
            "messages": [{"role": "system", "content": _SYSTEM_PROMPT}, *messages],
        }
        return headers, body
    # Anthropic shape: dedicated system field + key header.
    headers = {
        "x-api-key": settings.ai_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": settings.ai_model,
        "max_tokens": 4096,
        "system": _SYSTEM_PROMPT,
        "messages": messages,
    }
    return headers, body


def _extract_text(response: dict[str, Any]) -> str:
    if _is_openai():
        choices = response.get("choices") or []
        if choices:
            return (choices[0].get("message") or {}).get("content", "").strip()
        return ""
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

    headers, body = _request(messages)
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(settings.ai_base_url, headers=headers, json=body)
        resp.raise_for_status()
        return _extract_text(resp.json())


async def translate_strings(
    texts: list[str],
    source_lang: str,
    target_lang: str,
) -> list[str]:
    """Translate a batch of strings from source_lang to target_lang using the AI provider."""
    if not is_configured():
        raise AIServiceError("AI translation is not configured on this server.")
    if not texts:
        return []

    numbered = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(texts))
    prompt = (
        f"Translate the following numbered strings from {source_lang} to {target_lang}. "
        "Return ONLY the translated strings in the same numbered format, one per line. "
        "Do not add explanations, notes, or extra text.\n\n"
        f"{numbered}"
    )
    messages = [{"role": "user", "content": prompt}]
    try:
        raw = await _call_api(messages)
    except Exception as exc:
        raise AIServiceError(f"AI request failed: {exc}") from exc

    lines = [ln.strip() for ln in raw.strip().splitlines() if ln.strip()]
    results: list[str] = []
    for line in lines:
        # Strip leading "N. " prefix if present.
        if line and line[0].isdigit():
            dot = line.find(". ")
            if dot != -1:
                line = line[dot + 2 :]
        results.append(line)

    # Pad or trim to match input length.
    while len(results) < len(texts):
        results.append(texts[len(results)])
    return results[: len(texts)]


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

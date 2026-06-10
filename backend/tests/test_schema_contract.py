"""Guard the four-place Form Schema contract from drifting.

The same form shape is defined in the JSON Schema, the Pydantic models, the TypeScript
types, and the Python SDK. These tests fail loudly if the JSON Schema and the Pydantic
models disagree on a field set — the most common "I changed one place and forgot the
others" mistake. (TS types and the SDK are exercised by their own suites.)
"""

from __future__ import annotations

import json
from pathlib import Path

from app.schemas.form_schema import Choice, FormSettings

_SCHEMA = json.loads(
    (
        Path(__file__).resolve().parents[2] / "packages/form-schema/schema/form.schema.json"
    ).read_text()
)
_DEFS = _SCHEMA.get("$defs") or _SCHEMA.get("definitions") or {}


def _aliases(model: type) -> set[str]:
    return {field.alias or name for name, field in model.model_fields.items()}


def test_settings_fields_match_json_schema() -> None:
    json_props = set(_DEFS["settings"]["properties"])
    assert _aliases(FormSettings) == json_props, (
        "FormSettings (Pydantic) and the JSON Schema 'settings' have drifted — "
        "update both (and the TS type + SDK)."
    )


def test_choice_fields_match_json_schema() -> None:
    json_props = set(_DEFS["choice"]["properties"])
    assert _aliases(Choice) == json_props, (
        "Choice (Pydantic) and the JSON Schema 'choice' have drifted."
    )

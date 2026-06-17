"""Guard the four-place Form Schema contract from drifting.

The same form shape is defined in the JSON Schema, the Pydantic models, the TypeScript
types, and the Python SDK. These tests fail loudly if any of the four places diverge on
the set of element types or key struct fields — the most common "I changed one place and
forgot the others" mistake.
"""

from __future__ import annotations

import importlib
import inspect
import json
import re
import sys
from pathlib import Path

from app.schemas.form_schema import Choice, ElementType, FormSettings

# Make the SDK importable without requiring a separate `pip install -e .` in the
# backend's environment. The SDK has no C extensions so a direct sys.path insert is safe.
_SDK_SRC = Path(__file__).resolve().parents[2] / "sdk" / "python"
if str(_SDK_SRC) not in sys.path:
    sys.path.insert(0, str(_SDK_SRC))

_REPO = Path(__file__).resolve().parents[2]
_SCHEMA = json.loads((_REPO / "packages/form-schema/schema/form.schema.json").read_text())
_DEFS = _SCHEMA.get("$defs") or _SCHEMA.get("definitions") or {}

# Canonical set: the Pydantic StrEnum is the single source of truth for valid types.
_CANONICAL: frozenset[str] = frozenset(e.value for e in ElementType)

# System/runtime types that are never hand-authored by a form builder
# (auto-populated by the runtime; excluded from SDK builder coverage).
_RUNTIME_TYPES: frozenset[str] = frozenset(["start", "end", "today", "deviceid", "username"])
# Types that are structural/grouping containers only (no builder needed; Group/Repeat exist).
_CONTAINER_ONLY: frozenset[str] = frozenset()
# Full set that SDK builders are expected to cover.
_BUILDABLE: frozenset[str] = _CANONICAL - _RUNTIME_TYPES


def _aliases(model: type) -> set[str]:
    return {field.alias or name for name, field in model.model_fields.items()}


# ── Existing struct-field tests ──────────────────────────────────────────────

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


# ── ElementType four-way contract tests ──────────────────────────────────────

def test_element_types_in_typescript() -> None:
    """Every Pydantic ElementType must appear as a string literal in form-schema.ts."""
    ts_file = _REPO / "frontend/src/types/form-schema.ts"
    source = ts_file.read_text()
    # Extract the ElementType union: lines between 'export type ElementType =' and the
    # next blank line or non-pipe line.
    block_match = re.search(r"export type ElementType\s*=\s*((?:\s*\|?\s*\"[^\"]+\"\s*)+)", source)
    assert block_match, "Could not locate 'export type ElementType' in form-schema.ts"
    ts_types = set(re.findall(r'"([^"]+)"', block_match.group(1)))
    missing = _CANONICAL - ts_types
    assert not missing, (
        f"ElementType(s) present in Pydantic but missing from TypeScript form-schema.ts: "
        f"{sorted(missing)}\n"
        "Add them to the ElementType union in frontend/src/types/form-schema.ts."
    )


def test_element_types_in_json_schema() -> None:
    """Every Pydantic ElementType must appear in the JSON Schema element.type examples."""
    examples = set(_DEFS["element"]["properties"]["type"].get("examples", []))
    missing = _CANONICAL - examples
    assert not missing, (
        f"ElementType(s) present in Pydantic but missing from JSON Schema examples: "
        f"{sorted(missing)}\n"
        "Add them to packages/form-schema/schema/form.schema.json element.type.examples."
    )


def test_element_types_in_sdk_builders() -> None:
    """Every buildable ElementType must have a builder in the SDK's fields module.

    'Buildable' excludes runtime/system types (start, end, today, deviceid, username)
    that are auto-populated and never hand-authored. Any type added to Pydantic
    ElementType must also get a builder — this test will fail loudly if it doesn't.
    """
    fields = importlib.import_module("supform_sdk.fields")

    # Discover which types the SDK can produce by calling each public builder.
    # We call them with minimal required args to get the emitted "type" value.
    sdk_types: set[str] = set()
    for name, fn in inspect.getmembers(fields, inspect.isfunction):
        if name.startswith("_"):
            continue
        try:
            # Probe each builder with the minimal args it needs.
            result = _probe_builder(fn, name)
            if isinstance(result, dict) and "type" in result:
                sdk_types.add(result["type"])
        except Exception:
            # If probing fails, skip — we'll catch it in the missing assertion below.
            pass

    missing = _BUILDABLE - sdk_types
    assert not missing, (
        f"ElementType(s) present in Pydantic but missing from SDK fields.py builders: "
        f"{sorted(missing)}\n"
        "Add a builder function for each missing type to sdk/python/supform_sdk/fields.py."
    )


def _probe_builder(fn, name: str) -> dict:
    """Call a builder with stub minimal args to discover what type it emits."""
    import inspect as _inspect

    sig = _inspect.signature(fn)
    params = sig.parameters

    kwargs: dict = {}
    for pname, param in params.items():
        if pname == "name":
            continue  # always supplied as the first positional arg
        if param.default is not _inspect.Parameter.empty:
            continue  # has a default, skip
        if param.kind in (_inspect.Parameter.VAR_POSITIONAL, _inspect.Parameter.VAR_KEYWORD):
            continue
        # Required parameter — supply a minimal stub value based on annotation/name.
        ann = param.annotation
        ann_str = str(ann) if ann is not _inspect.Parameter.empty else ""
        if "list" in ann_str.lower() or pname in ("elements", "options", "rows", "columns"):
            kwargs[pname] = []
        elif "str" in ann_str.lower() or pname in ("label", "calculate", "entry_label"):
            kwargs[pname] = "stub"
        elif "int" in ann_str.lower():
            kwargs[pname] = 0
        elif "float" in ann_str.lower():
            kwargs[pname] = 0.0
        elif "bool" in ann_str.lower():
            kwargs[pname] = False
        else:
            kwargs[pname] = "stub"

    # First positional arg is always `name`.
    return fn("_probe", **kwargs)

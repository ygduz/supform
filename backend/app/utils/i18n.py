"""Helpers for the i18n string type used throughout the form schema."""

from __future__ import annotations

from typing import Any


def localize(value: Any, lang: str, default_lang: str = "en") -> str:
    """Resolve an i18n string (plain str or {lang: str} map) to a single language."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get(lang) or value.get(default_lang) or next(iter(value.values()), "")
    return "" if value is None else str(value)

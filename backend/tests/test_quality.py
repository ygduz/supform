"""Automated data quality flags computed at submission time."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.form_engine.quality import run_quality_checks
from app.schemas.form_schema import FormSchema


def _form(settings: dict | None = None, elements: list | None = None) -> FormSchema:
    return FormSchema.model_validate(
        {
            "name": "f",
            "title": "F",
            "settings": settings or {},
            "pages": [{"name": "p1", "elements": elements or [{"type": "text", "name": "q1"}]}],
        }
    )


def test_no_flags_for_clean_submission() -> None:
    form = _form({"qualityChecks": {"minDurationSeconds": 30}})
    started = (datetime.now(UTC) - timedelta(minutes=2)).isoformat()
    flags = run_quality_checks(form, {"q1": "Alice"}, {"_started_at": started})
    assert flags == []


def test_too_fast_flag() -> None:
    form = _form({"qualityChecks": {"minDurationSeconds": 60}})
    started = (datetime.now(UTC) - timedelta(seconds=5)).isoformat()
    flags = run_quality_checks(form, {"q1": "Alice"}, {"_started_at": started})
    assert "too_fast" in flags


def test_too_fast_default_threshold_30s() -> None:
    form = _form()  # no qualityChecks → default 30s
    started = (datetime.now(UTC) - timedelta(seconds=10)).isoformat()
    flags = run_quality_checks(form, {"q1": "Alice"}, {"_started_at": started})
    assert "too_fast" in flags


def test_missing_started_at_skips_too_fast() -> None:
    form = _form({"qualityChecks": {"minDurationSeconds": 60}})
    flags = run_quality_checks(form, {"q1": "Alice"}, {})
    assert "too_fast" not in flags


def test_straight_lining_matrix() -> None:
    form = _form(
        elements=[
            {
                "type": "matrix",
                "name": "m",
                "rows": [{"value": "r1"}, {"value": "r2"}],
                "columns": [{"value": "c1"}, {"value": "c2"}],
            }
        ],
    )
    flags = run_quality_checks(form, {"m": {"r1": "c1", "r2": "c1"}}, {})
    assert "straight_lining" in flags


def test_matrix_with_varied_answers_not_flagged() -> None:
    form = _form(
        elements=[
            {
                "type": "matrix",
                "name": "m",
                "rows": [{"value": "r1"}, {"value": "r2"}],
                "columns": [{"value": "c1"}, {"value": "c2"}],
            }
        ],
    )
    flags = run_quality_checks(form, {"m": {"r1": "c1", "r2": "c2"}}, {})
    assert "straight_lining" not in flags


def test_straight_lining_scale() -> None:
    form = _form(
        elements=[
            {"type": "scale", "name": "s1"},
            {"type": "scale", "name": "s2"},
            {"type": "rating", "name": "s3"},
        ],
    )
    flags = run_quality_checks(form, {"s1": 5, "s2": 5, "s3": 5}, {})
    assert "straight_lining" in flags


def test_geo_outlier_flag() -> None:
    # Bounding box around roughly Turkey; a point in Brazil is outside.
    form = _form(
        {"qualityChecks": {"expectedGeoBbox": [36.0, 26.0, 42.0, 45.0]}},
        elements=[{"type": "geopoint", "name": "loc"}],
    )
    flags = run_quality_checks(form, {"loc": {"lat": -23.5, "lng": -46.6}}, {})
    assert "geo_outlier" in flags


def test_geo_inside_bbox_not_flagged() -> None:
    form = _form(
        {"qualityChecks": {"expectedGeoBbox": [36.0, 26.0, 42.0, 45.0]}},
        elements=[{"type": "geopoint", "name": "loc"}],
    )
    flags = run_quality_checks(form, {"loc": {"lat": 39.0, "lng": 35.0}}, {})
    assert "geo_outlier" not in flags

"""Automated data quality checks run on every submission.

Flags are stored in ``metadata_["_quality_flags"]`` so they survive alongside the raw
answers and can be filtered/displayed in the responses table without re-computation.

Current checks
--------------
``too_fast``
    Completion time (client-sent ``_started_at`` ISO timestamp in metadata vs. server
    receive time) is below the form's configured minimum. Default threshold: 30 s.
    Requires the renderer to embed ``_started_at`` in submission metadata.

``straight_lining``
    A matrix question where every row was answered with the identical column value, or
    3+ scale/rating questions in the form all answered with the same value.  Suggests
    the respondent clicked through without reading.

``geo_outlier``
    A geopoint answer falls outside the form's configured bounding box
    ``[minLat, minLng, maxLat, maxLng]``.  Only checked when ``expectedGeoBbox`` is set.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.schemas.form_schema import Element, ElementType, FormSchema

# ── helpers ────────────────────────────────────────────────────────────────────


def _all_elements(schema: FormSchema) -> list[Element]:
    out: list[Element] = []

    def walk(els: list[Element]) -> None:
        for el in els:
            out.append(el)
            if el.elements:
                walk(el.elements)

    for page in schema.pages:
        walk(page.elements)
    return out


def _check_too_fast(
    metadata: dict[str, Any],
    now: datetime,
    min_seconds: int,
) -> bool:
    started_raw = metadata.get("_started_at")
    if not started_raw:
        return False
    try:
        started = datetime.fromisoformat(str(started_raw).replace("Z", "+00:00"))
        if started.tzinfo is None:
            started = started.replace(tzinfo=UTC)
        return (now - started).total_seconds() < min_seconds
    except (ValueError, TypeError):
        return False


def _check_straight_lining(elements: list[Element], answers: dict[str, Any]) -> bool:
    # Matrix: every row answered with the same column.
    for el in elements:
        if el.type == ElementType.MATRIX and el.rows and el.columns:
            ans = answers.get(el.name)
            if isinstance(ans, dict) and len(ans) >= 2:
                unique_vals = set(ans.values())
                if len(unique_vals) == 1:
                    return True

    # Scale / rating: 3+ questions all answered identically.
    scale_types = {ElementType.SCALE, ElementType.RATING}
    scale_answers: list[Any] = []
    for el in elements:
        if el.type in scale_types:
            val = answers.get(el.name)
            if val is not None:
                scale_answers.append(val)
    if len(scale_answers) >= 3 and len(set(str(v) for v in scale_answers)) == 1:
        return True

    return False


def _check_geo_outlier(
    elements: list[Element],
    answers: dict[str, Any],
    bbox: list[float],
) -> bool:
    if len(bbox) != 4:
        return False
    min_lat, min_lng, max_lat, max_lng = bbox
    for el in elements:
        if el.type == ElementType.GEOPOINT:
            ans = answers.get(el.name)
            if isinstance(ans, dict):
                lat = ans.get("lat")
                lng = ans.get("lng")
                if lat is not None and lng is not None:
                    try:
                        in_lat = min_lat <= float(lat) <= max_lat
                        in_lng = min_lng <= float(lng) <= max_lng
                        if not (in_lat and in_lng):
                            return True
                    except (ValueError, TypeError):
                        pass
    return False


# ── public API ─────────────────────────────────────────────────────────────────


def run_quality_checks(
    schema: FormSchema,
    answers: dict[str, Any],
    metadata: dict[str, Any],
    now: datetime | None = None,
) -> list[str]:
    """Return a (possibly empty) list of quality flag strings for a submission."""
    if now is None:
        now = datetime.now(UTC)

    flags: list[str] = []
    qc = schema.settings.quality_checks
    elements = _all_elements(schema)

    min_seconds = qc.min_duration_seconds if qc and qc.min_duration_seconds is not None else 30
    if _check_too_fast(metadata, now, min_seconds):
        flags.append("too_fast")

    if _check_straight_lining(elements, answers):
        flags.append("straight_lining")

    bbox = qc.expected_geo_bbox if qc else None
    if bbox and _check_geo_outlier(elements, answers, list(bbox)):
        flags.append("geo_outlier")

    return flags

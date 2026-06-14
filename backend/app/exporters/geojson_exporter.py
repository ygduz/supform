"""GeoJSON export — all submissions that contain geo fields as a FeatureCollection.

Each submission becomes one Feature. Point geometry comes from the first geopoint field;
geotrace → LineString; geoshape → Polygon. All other answer fields are included as
feature properties alongside _id and _submitted_at.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from app.schemas.form_schema import Element, ElementType, FormSchema

_GEO_TYPES = frozenset([ElementType.GEOPOINT, ElementType.GEOTRACE, ElementType.GEOSHAPE])


def _collect_geo_fields(form: FormSchema) -> list[Element]:
    out: list[Element] = []

    def _walk(elements: list[Element]) -> None:
        for el in elements:
            if el.type in _GEO_TYPES:
                out.append(el)
            if el.elements:
                _walk(el.elements)

    for page in form.pages:
        _walk(page.elements)
    return out


def _make_geometry(el: Element, value: Any) -> dict[str, Any] | None:
    if el.type == ElementType.GEOPOINT:
        if not isinstance(value, dict):
            return None
        lat = value.get("lat")
        lng = value.get("lng")
        if lat is None or lng is None:
            return None
        return {"type": "Point", "coordinates": [lng, lat]}

    if el.type == ElementType.GEOTRACE:
        if not isinstance(value, list) or len(value) < 2:
            return None
        coords = [[p.get("lng"), p.get("lat")] for p in value if isinstance(p, dict)]
        if len(coords) < 2:
            return None
        return {"type": "LineString", "coordinates": coords}

    if el.type == ElementType.GEOSHAPE:
        if not isinstance(value, list) or len(value) < 4:
            return None
        coords = [[p.get("lng"), p.get("lat")] for p in value if isinstance(p, dict)]
        if len(coords) < 4:
            return None
        # GeoJSON polygon rings must close; the server stores the closing point already.
        return {"type": "Polygon", "coordinates": [coords]}

    return None


def export_geojson(form: FormSchema, submissions: Iterable[dict[str, Any]]) -> str:
    geo_fields = _collect_geo_fields(form)
    features: list[dict[str, Any]] = []

    for sub in submissions:
        answers = sub.get("answers") or {}
        geometry: dict[str, Any] | None = None

        # Use the first geo field that has a valid value for this submission.
        for el in geo_fields:
            geom = _make_geometry(el, answers.get(el.name))
            if geom is not None:
                geometry = geom
                break

        properties: dict[str, Any] = {
            "_id": sub.get("id"),
            "_submitted_at": str(sub.get("created_at", "")),
        }
        for key, value in answers.items():
            # Serialize non-primitive values to JSON strings for property safety.
            if isinstance(value, (dict, list)):
                properties[key] = json.dumps(value, default=str)
            else:
                properties[key] = value

        features.append({
            "type": "Feature",
            "geometry": geometry,
            "properties": properties,
        })

    collection = {
        "type": "FeatureCollection",
        "features": features,
    }
    return json.dumps(collection, default=str, ensure_ascii=False, indent=2)

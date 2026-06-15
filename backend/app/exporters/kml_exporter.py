"""KML export — geo submissions as a KML FeatureCollection for Google Earth / Maps.

Each submission with at least one geopoint/geotrace/geoshape field becomes a Placemark.
The first non-empty geo field determines the geometry; all answer fields are included
as ExtendedData key-value pairs.
"""

from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from collections.abc import Iterable
from typing import Any

from app.exporters.geojson_exporter import _collect_geo_fields, _make_geometry
from app.schemas.form_schema import FormSchema


def _esc(text: str) -> str:
    return (
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    )


def _geometry_to_kml(geom: dict[str, Any]) -> ET.Element | None:
    kind = geom.get("type")
    coords = geom.get("coordinates")

    if kind == "Point" and isinstance(coords, list) and len(coords) >= 2:
        pt = ET.Element("Point")
        ET.SubElement(pt, "coordinates").text = f"{coords[0]},{coords[1]},0"
        return pt

    if kind == "LineString" and isinstance(coords, list):
        ls = ET.Element("LineString")
        coord_str = " ".join(f"{c[0]},{c[1]},0" for c in coords if len(c) >= 2)
        ET.SubElement(ls, "coordinates").text = coord_str
        return ls

    if kind == "Polygon" and isinstance(coords, list) and coords:
        poly = ET.Element("Polygon")
        outer = ET.SubElement(poly, "outerBoundaryIs")
        ring = ET.SubElement(outer, "LinearRing")
        coord_str = " ".join(f"{c[0]},{c[1]},0" for c in coords[0] if len(c) >= 2)
        ET.SubElement(ring, "coordinates").text = coord_str
        return poly

    return None


def export_kml(form: FormSchema, submissions: Iterable[dict[str, Any]]) -> str:
    geo_fields = _collect_geo_fields(form)

    root = ET.Element("kml", xmlns="http://www.opengis.net/kml/2.2")
    doc = ET.SubElement(root, "Document")
    ET.SubElement(doc, "name").text = form.name or "Supform export"

    for sub in submissions:
        answers = sub.get("answers") or {}
        geometry: dict[str, Any] | None = None

        for el in geo_fields:
            geom = _make_geometry(el, answers.get(el.name))
            if geom is not None:
                geometry = geom
                break

        pm = ET.SubElement(doc, "Placemark")
        ET.SubElement(pm, "name").text = f"Response {str(sub.get('id', ''))[:8]}"
        desc_parts = [f"Submitted: {sub.get('created_at', '')}"]
        for key, val in answers.items():
            if isinstance(val, (dict, list)):
                val = json.dumps(val, default=str)
            desc_parts.append(f"{key}: {val}")
        ET.SubElement(pm, "description").text = "\n".join(desc_parts)

        if geometry:
            kml_geom = _geometry_to_kml(geometry)
            if kml_geom is not None:
                pm.append(kml_geom)

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode")

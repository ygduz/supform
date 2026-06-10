import type { SubmissionRow } from "@/api/client";
import { localize } from "@/lib/i18n";
import type { Element, FormSchema } from "@/types/form-schema";
import L from "leaflet";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

// Leaflet's default marker images don't resolve under bundlers; wire them up explicitly.
L.Marker.prototype.options.icon = L.icon({
  iconUrl: icon,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface GeoPoint {
  lat: number;
  lng: number;
}

function geoFields(schema: FormSchema): Element[] {
  const out: Element[] = [];
  const walk = (els: Element[]) => {
    for (const el of els) {
      if (el.type === "geopoint") out.push(el);
      if (el.elements) walk(el.elements);
    }
  };
  for (const p of schema.pages) walk(p.elements);
  return out;
}

function asPoint(value: unknown): GeoPoint | null {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.lat === "number" && typeof v.lng === "number") {
      return { lat: v.lat, lng: v.lng };
    }
  }
  return null;
}

interface MarkerData {
  point: GeoPoint;
  label: string;
  submittedAt: string;
}

/** Plots every geopoint answer on an OpenStreetMap. */
export function MapPanel({ schema, rows }: { schema: FormSchema; rows: SubmissionRow[] }) {
  const fields = useMemo(() => geoFields(schema), [schema]);
  const markers = useMemo<MarkerData[]>(() => {
    const out: MarkerData[] = [];
    for (const row of rows) {
      for (const field of fields) {
        const point = asPoint(row.answers[field.name]);
        if (point) {
          out.push({
            point,
            label: localize(field.label) || field.name,
            submittedAt: new Date(row.created_at).toLocaleString(),
          });
        }
      }
    }
    return out;
  }, [rows, fields]);

  if (fields.length === 0) {
    return <p className="muted">This form has no location questions to map.</p>;
  }
  if (markers.length === 0) {
    return <p className="muted">No responses include a location yet.</p>;
  }

  const center: [number, number] = [markers[0].point.lat, markers[0].point.lng];

  return (
    <div className="map-panel">
      <MapContainer center={center} zoom={5} scrollWheelZoom className="response-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map((m, i) => (
          <Marker key={`${m.point.lat}-${m.point.lng}-${i}`} position={[m.point.lat, m.point.lng]}>
            <Popup>
              <strong>{m.label}</strong>
              <br />
              {m.point.lat.toFixed(5)}, {m.point.lng.toFixed(5)}
              <br />
              <span className="muted">{m.submittedAt}</span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Circle, Polyline, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useEffect } from "react";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  label?: string;
  popup?: React.ReactNode;
  radius?: number;
  ring?: boolean;
}

export interface MapProps {
  markers?: MapMarker[];
  circles?: { lat: number; lng: number; radiusM: number; color?: string }[];
  lines?: { points: [number, number][]; color?: string; dashed?: boolean }[];
  center?: [number, number];
  zoom?: number;
  onPick?: (lat: number, lng: number) => void;
  fitToMarkers?: boolean;
  height?: number | string;
}

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    // Programmatic fits are never animated: an interrupted zoom animation leaves panes scaled.
    if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 16), { animate: false });
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 16, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function Picker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function MapInner({ markers = [], circles = [], lines = [], center, zoom = 12, onPick, fitToMarkers = true, height = 320 }: MapProps) {
  const points: [number, number][] = [...markers.map((m) => [m.lat, m.lng] as [number, number]), ...lines.flatMap((l) => l.points)];
  const c: [number, number] = center ?? points[0] ?? [13.0827, 80.2707];
  const initialZoom = points.length === 1 && fitToMarkers ? 16 : zoom;
  return (
    <div style={{ height }} className="overflow-hidden rounded-xl border border-slate-200">
      <MapContainer center={c} zoom={initialZoom} scrollWheelZoom style={{ height: "100%", width: "100%" }} className={onPick ? "cursor-crosshair" : undefined}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {fitToMarkers && points.length > 0 && <Fit points={points} />}
        {onPick && <Picker onPick={onPick} />}
        {circles.map((ci, i) => (
          <Circle key={i} center={[ci.lat, ci.lng]} radius={ci.radiusM} pathOptions={{ color: ci.color ?? "#16a34a", weight: 1.5, fillOpacity: 0.08, dashArray: "4 4" }} />
        ))}
        {lines.map((l, i) => (
          <Polyline key={i} positions={l.points} pathOptions={{ color: l.color ?? "#64748b", weight: 2, dashArray: l.dashed ? "6 6" : undefined, opacity: 0.8 }} />
        ))}
        {markers.map((m) => (
          <CircleMarker
            key={m.id}
            center={[m.lat, m.lng]}
            radius={m.radius ?? 8}
            pathOptions={{ color: "#ffffff", weight: m.ring ? 3 : 2, fillColor: m.color ?? "#d97706", fillOpacity: 1 }}
          >
            {m.label && (
              <Tooltip direction="top" offset={[0, -8]}>
                {m.label}
              </Tooltip>
            )}
            {m.popup && <Popup>{m.popup}</Popup>}
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

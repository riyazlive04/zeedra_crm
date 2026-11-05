"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Polygon, Polyline, Circle, Marker, ImageOverlay, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Blocker, DesignData, LatLng, Scene, Vec2 } from "@/lib/solar/shading";
import { panelId, fmtLen, STRING_COLORS, type Selection, type Tool } from "./common";

export const TILE_SOURCES = {
  esri: { label: "Solar Map", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", native: 19 },
  clarity: { label: "Clarity (alt. imagery)", url: "https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", native: 19 },
  streets: { label: "Street map", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", native: 19 },
} as const;
export type TileSource = keyof typeof TILE_SOURCES;

export interface Map2DProps {
  design: DesignData;
  scene: Scene;
  tool: Tool;
  selection: Selection;
  panelColors: (string | null)[];
  shadows: LatLng[][];
  labelSize: "s" | "m" | "l";
  tileSource: TileSource;
  units: "m" | "ft";
  activeString: string[] | null;
  onSelect: (s: Selection) => void;
  onFinishShape: (tool: Tool, pts: LatLng[]) => void;
  onEditZonePoints: (id: string, pts: LatLng[]) => void;
  onEditBlocker: (id: string, patch: Partial<Blocker>) => void;
  onPanelClick: (pid: string) => void;
  onPlaceInverter: (p: LatLng) => void;
  onContext: (target: { type: "zone" | "blocker" | "panel"; id: string }, x: number, y: number) => void;
  onView: (center: LatLng, zoom: number) => void;
  onOverlayBounds: (b: [LatLng, LatLng]) => void;
  onCancelTool: () => void;
  fitKey: number;
}

const ll = (p: LatLng): [number, number] => [p.lat, p.lng];
const toLL = (p: L.LatLng): LatLng => ({ lat: p.lat, lng: p.lng });

function vertexIcon(kind: "vertex" | "mid" | "move") {
  const size = kind === "mid" ? 10 : kind === "move" ? 18 : 12;
  const cls =
    kind === "mid" ? "background:rgba(255,255,255,.7);border:1.5px solid #0ea5e9" : kind === "move" ? "background:#0ea5e9;border:2px solid #fff;cursor:move" : "background:#fff;border:2px solid #0ea5e9";
  return L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: `<div style="width:${size}px;height:${size}px;border-radius:${kind === "move" ? "50%" : "3px"};${cls}"></div>` });
}

function labelIcon(text: string, size: "s" | "m" | "l") {
  const fs = size === "s" ? 9 : size === "l" ? 13 : 11;
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;background:#0f172a;color:#fff;font:600 ${fs}px/1.2 system-ui;padding:2px 5px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.4)">✎ ${text}</div>`,
  });
}

function distM(a: LatLng, b: LatLng) {
  return L.latLng(a.lat, a.lng).distanceTo(L.latLng(b.lat, b.lng));
}

/** Edge-length labels for a closed or open outline. */
function EdgeLabels({ pts, closed, size, units }: { pts: LatLng[]; closed: boolean; size: "s" | "m" | "l"; units: "m" | "ft" }) {
  const edges: [LatLng, LatLng][] = [];
  for (let i = 0; i < pts.length - 1; i++) edges.push([pts[i], pts[i + 1]]);
  if (closed && pts.length > 2) edges.push([pts[pts.length - 1], pts[0]]);
  return (
    <>
      {edges.map(([a, b], i) => (
        <Marker key={i} position={[(a.lat + b.lat) / 2, (a.lng + b.lng) / 2]} icon={labelIcon(fmtLen(distM(a, b), units), size)} interactive={false} />
      ))}
    </>
  );
}

function Controller({ props, draft, setDraft, setCursor }: { props: Map2DProps; draft: LatLng[]; setDraft: (d: LatLng[]) => void; setCursor: (c: LatLng | null) => void }) {
  const map = useMap();
  const { tool } = props;
  const drawing = tool !== "select" && tool !== "string";
  useEffect(() => {
    if (drawing) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    map.getContainer().style.cursor = drawing ? "crosshair" : "";
  }, [drawing, map]);

  const finish = (pts: LatLng[]) => {
    setDraft([]);
    props.onFinishShape(tool, pts);
  };

  useMapEvents({
    click(e) {
      const p = toLL(e.latlng);
      if (tool === "inverter") return props.onPlaceInverter(p);
      if (tool === "select" || tool === "string") {
        if (tool === "select") props.onSelect(null);
        return;
      }
      if (tool === "rect" || tool === "circle" || tool === "tree") {
        if (draft.length === 0) setDraft([p]);
        else finish([draft[0], p]);
        return;
      }
      // Polygon tools: clicking near the first vertex closes the shape.
      if (draft.length >= 3) {
        const a = map.latLngToContainerPoint(ll(draft[0]));
        if (a.distanceTo(e.containerPoint) < 12) return finish(draft);
      }
      setDraft([...draft, p]);
    },
    dblclick() {
      if ((tool === "zone" || tool === "polygon") && draft.length >= 3) {
        // The dblclick's own two clicks added the same point twice — drop near-duplicates.
        const dedup = draft.filter((p, i) => i === 0 || distM(p, draft[i - 1]) > 0.05);
        finish(dedup);
      }
    },
    mousemove(e) {
      if (drawing) setCursor(toLL(e.latlng));
    },
    moveend() {
      const c = map.getCenter();
      props.onView({ lat: c.lat, lng: c.lng }, map.getZoom());
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.key === "Escape") {
        setDraft([]);
        props.onCancelTool();
      } else if (e.key === "Enter" && draft.length >= 3 && (tool === "zone" || tool === "polygon")) finish(draft);
      else if (e.key === "Backspace" && draft.length) setDraft(draft.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return null;
}

function FitOnce({ center, zoom, fitKey }: { center: LatLng; zoom: number; fitKey: number }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    map.setView(ll(center), zoom, { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

/** Exposes the current map bounds for the drone-overlay "place over view" action. */
function BoundsGrabber({ onReady }: { onReady: (get: () => [LatLng, LatLng]) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(() => {
      const b = map.getBounds().pad(-0.15);
      return [toLL(b.getSouthWest()), toLL(b.getNorthEast())];
    });
  }, [map, onReady]);
  return null;
}

export default function Map2D(props: Map2DProps & { onBoundsGetter?: (get: () => [LatLng, LatLng]) => void }) {
  const { design, scene, selection, tool, labelSize, units } = props;
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [cursor, setCursor] = useState<LatLng | null>(null);
  useEffect(() => setDraft([]), [tool]);
  const src = TILE_SOURCES[props.tileSource];
  const toLatLng = scene.proj.toLatLng;
  const sel = (t: "zone" | "blocker", id: string) => selection?.type === t && selection.id === id;
  const canSelect = tool === "select";

  const stringIndexOf = useMemo(() => {
    const m = new Map<string, number>();
    (design.strings ?? []).forEach((s, i) => s.panels.forEach((p) => m.set(p, i)));
    return m;
  }, [design.strings]);
  const panelById = useMemo(() => new Map(scene.panels.map((p) => [panelId(p), p])), [scene]);
  const centerLL = (pid: string) => {
    const p = panelById.get(pid);
    return p ? ll(toLatLng(p.center)) : null;
  };

  const editHandles = (pts: LatLng[], onChange: (pts: LatLng[]) => void) => {
    const c = { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length };
    return (
      <>
        {pts.map((p, i) => (
          <Marker
            key={`v${i}-${p.lat}-${p.lng}`}
            position={ll(p)}
            icon={vertexIcon("vertex")}
            draggable
            eventHandlers={{
              dragend: (e) => onChange(pts.map((q, j) => (j === i ? toLL((e.target as L.Marker).getLatLng()) : q))),
              contextmenu: () => pts.length > 3 && onChange(pts.filter((_, j) => j !== i)),
            }}
          />
        ))}
        {pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length];
          const mid = { lat: (p.lat + q.lat) / 2, lng: (p.lng + q.lng) / 2 };
          return (
            <Marker
              key={`m${i}-${mid.lat}`}
              position={ll(mid)}
              icon={vertexIcon("mid")}
              draggable
              eventHandlers={{ dragend: (e) => onChange([...pts.slice(0, i + 1), toLL((e.target as L.Marker).getLatLng()), ...pts.slice(i + 1)]) }}
            />
          );
        })}
        <Marker
          key={`c${c.lat}-${c.lng}`}
          position={ll(c)}
          icon={vertexIcon("move")}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const n = (e.target as L.Marker).getLatLng();
              const dLat = n.lat - c.lat, dLng = n.lng - c.lng;
              onChange(pts.map((q) => ({ lat: q.lat + dLat, lng: q.lng + dLng })));
            },
          }}
        />
      </>
    );
  };

  const ctx = (type: "zone" | "blocker" | "panel", id: string) => (e: L.LeafletMouseEvent) => {
    L.DomEvent.stop(e);
    e.originalEvent.preventDefault();
    props.onContext({ type, id }, e.originalEvent.clientX, e.originalEvent.clientY);
  };

  return (
    <MapContainer
      center={ll(design.center)}
      zoom={design.zoom || 20}
      maxZoom={23}
      zoomSnap={0.25}
      preferCanvas
      zoomControl={false}
      style={{ height: "100%", width: "100%", background: "#1e293b" }}
      attributionControl
    >
      <TileLayer
        key={props.tileSource}
        url={src.url}
        maxNativeZoom={src.native}
        maxZoom={23}
        attribution={props.tileSource === "streets" ? "&copy; OpenStreetMap" : "Imagery &copy; Esri, Maxar, Earthstar Geographics"}
      />
      <FitOnce center={design.center} zoom={design.zoom || 20} fitKey={props.fitKey} />
      {props.onBoundsGetter && <BoundsGrabber onReady={props.onBoundsGetter} />}
      {design.overlay && (
        <>
          <ImageOverlay url={design.overlay.url} bounds={[ll(design.overlay.bounds[0]), ll(design.overlay.bounds[1])]} opacity={design.overlay.opacity} />
          {tool === "select" &&
            [0, 1].map((i) => (
              <Marker
                key={`ov${i}-${design.overlay!.bounds[i].lat}`}
                position={ll(design.overlay!.bounds[i])}
                icon={vertexIcon("vertex")}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const b = [...design.overlay!.bounds] as [LatLng, LatLng];
                    b[i] = toLL((e.target as L.Marker).getLatLng());
                    props.onOverlayBounds(b);
                  },
                }}
              />
            ))}
        </>
      )}
      <Controller props={props} draft={draft} setDraft={setDraft} setCursor={setCursor} />

      {/* Zones */}
      {design.zones.map((z) => (
        <Polygon
          key={z.id}
          positions={z.points.map(ll)}
          pathOptions={{ color: sel("zone", z.id) ? "#38bdf8" : "#facc15", weight: sel("zone", z.id) ? 3 : 2, fillColor: "#facc15", fillOpacity: 0.12 }}
          eventHandlers={{
            click: (e) => {
              if (!canSelect) return;
              L.DomEvent.stop(e);
              props.onSelect({ type: "zone", id: z.id });
            },
            contextmenu: ctx("zone", z.id),
          }}
        />
      ))}

      {/* Shadows (live sun) */}
      {props.shadows.map((s, i) => (
        <Polygon key={`sh${i}`} positions={s.map(ll)} interactive={false} pathOptions={{ stroke: false, fillColor: "#020617", fillOpacity: 0.38 }} />
      ))}

      {/* Blockers */}
      {design.blockers.map((b) => {
        const color = sel("blocker", b.id) ? "#38bdf8" : b.kind === "tree" ? "#22c55e" : "#ef4444";
        const handlers = {
          click: (e: L.LeafletMouseEvent) => {
            if (!canSelect) return;
            L.DomEvent.stop(e);
            props.onSelect({ type: "blocker", id: b.id });
          },
          contextmenu: ctx("blocker", b.id),
        };
        return (b.kind === "circle" || b.kind === "tree") && b.center ? (
          <Circle key={b.id} center={ll(b.center)} radius={b.radius ?? 1} pathOptions={{ color, weight: 2, fillOpacity: 0.3, dashArray: b.kind === "tree" ? "4 3" : undefined }} eventHandlers={handlers} />
        ) : (
          <Polygon key={b.id} positions={b.points.map(ll)} pathOptions={{ color, weight: 2, fillOpacity: 0.3 }} eventHandlers={handlers} />
        );
      })}

      {/* Panels */}
      {scene.panels.map((p, i) => {
        const pid = panelId(p);
        const si = stringIndexOf.get(pid);
        const inActive = props.activeString?.includes(pid);
        return (
          <Polygon
            key={pid}
            positions={p.corners.map((c: Vec2) => ll(toLatLng(c)))}
            pathOptions={
              p.removed
                ? { color: "#e2e8f0", weight: 1, dashArray: "3 3", fillOpacity: 0.05 }
                : {
                    color: inActive ? "#fff" : si !== undefined ? STRING_COLORS[si % STRING_COLORS.length] : "#cbd5e1",
                    weight: inActive || si !== undefined ? 2 : 0.8,
                    fillColor: props.panelColors[i] ?? "#1e3a8a",
                    fillOpacity: 0.88,
                  }
            }
            eventHandlers={{
              click: (e) => {
                if (tool !== "select" && tool !== "string") return;
                L.DomEvent.stop(e);
                props.onPanelClick(pid);
              },
              contextmenu: ctx("panel", pid),
            }}
          />
        );
      })}

      {/* Strings */}
      {(design.strings ?? []).map((s, i) => {
        const pts = s.panels.map(centerLL).filter(Boolean) as [number, number][];
        return pts.length > 1 ? <Polyline key={s.id} positions={pts} interactive={false} pathOptions={{ color: STRING_COLORS[i % STRING_COLORS.length], weight: 2.5 }} /> : null;
      })}
      {props.activeString && props.activeString.length > 1 && (
        <Polyline positions={props.activeString.map(centerLL).filter(Boolean) as [number, number][]} interactive={false} pathOptions={{ color: "#fff", weight: 2.5, dashArray: "5 4" }} />
      )}
      {design.wiring?.inverterAt && (
        <CircleMarker center={ll(design.wiring.inverterAt)} radius={8} pathOptions={{ color: "#fff", weight: 2, fillColor: "#7c3aed", fillOpacity: 1 }} interactive={false} />
      )}

      {/* Selected-shape editing + edge labels */}
      {selection?.type === "zone" &&
        canSelect &&
        (() => {
          const z = design.zones.find((x) => x.id === selection.id);
          if (!z) return null;
          return (
            <>
              <EdgeLabels pts={z.points} closed size={labelSize} units={units} />
              {editHandles(z.points, (pts) => props.onEditZonePoints(z.id, pts))}
            </>
          );
        })()}
      {selection?.type === "blocker" &&
        canSelect &&
        (() => {
          const b = design.blockers.find((x) => x.id === selection.id);
          if (!b) return null;
          if ((b.kind === "circle" || b.kind === "tree") && b.center)
            return (
              <Marker
                key={`bc${b.center.lat}`}
                position={ll(b.center)}
                icon={vertexIcon("move")}
                draggable
                eventHandlers={{ dragend: (e) => props.onEditBlocker(b.id, { center: toLL((e.target as L.Marker).getLatLng()) }) }}
              />
            );
          return (
            <>
              <EdgeLabels pts={b.points} closed size={labelSize} units={units} />
              {editHandles(b.points, (pts) => props.onEditBlocker(b.id, { points: pts }))}
            </>
          );
        })()}

      {/* Drawing preview */}
      {draft.length > 0 &&
        (() => {
          const live = cursor ? [...draft, cursor] : draft;
          if (tool === "rect" && cursor) {
            const a = draft[0];
            const rect = [a, { lat: a.lat, lng: cursor.lng }, cursor, { lat: cursor.lat, lng: a.lng }];
            return (
              <>
                <Polygon positions={rect.map(ll)} interactive={false} pathOptions={{ color: "#38bdf8", weight: 2, dashArray: "5 4", fillOpacity: 0.1 }} />
                <EdgeLabels pts={rect} closed size={labelSize} units={units} />
              </>
            );
          }
          if ((tool === "circle" || tool === "tree") && cursor)
            return (
              <>
                <Circle center={ll(draft[0])} radius={distM(draft[0], cursor)} interactive={false} pathOptions={{ color: "#38bdf8", weight: 2, dashArray: "5 4", fillOpacity: 0.1 }} />
                <EdgeLabels pts={[draft[0], cursor]} closed={false} size={labelSize} units={units} />
              </>
            );
          return (
            <>
              <Polyline positions={live.map(ll)} interactive={false} pathOptions={{ color: "#38bdf8", weight: 2, dashArray: "5 4" }} />
              {draft.map((p, i) => (
                <CircleMarker key={i} center={ll(p)} radius={i === 0 ? 6 : 4} interactive={false} pathOptions={{ color: "#38bdf8", fillColor: "#fff", fillOpacity: 1, weight: 2 }} />
              ))}
              <EdgeLabels pts={live} closed={false} size={labelSize} units={units} />
            </>
          );
        })()}
    </MapContainer>
  );
}

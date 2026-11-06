/**
 * Roof design & shading engine.
 *
 * Everything here is pure (no DOM / no Leaflet) so it can be unit-tested and reused by the 2D map,
 * the 3D view and the server. Geometry runs in a local metric frame (x = metres east, y = metres
 * north, z = metres above ground) centred on the design origin.
 *
 * Accuracy model:
 *  - Sun position: NOAA general solar position algorithm (±0.1° — plenty for shading).
 *  - Shadows: true 3D ray casting from sample points on every module towards the sun, against
 *    blockers (prisms/cylinders), parapet walls and every other module (inter-row shading).
 *  - Electrical mismatch: each module is split into 3 bypass-diode substrings running along its
 *    long side. A shaded cell starves its whole substring of beam light, so a thin strip of shadow
 *    along the bottom of a portrait module costs the whole module — not just the shaded area.
 *  - Diffuse light: each module's sky view is reduced by surrounding obstructions (horizon scan),
 *    so a module boxed in by a tall parapet loses diffuse as well as beam.
 *  - Irradiance weighting: losses are weighted by plane-of-array irradiance at each time step
 *    (clear-sky model), not by "hours in shadow", so a 7 am shadow counts far less than a noon one.
 *  - Weather: monthly all-sky / clear-sky ratios (NASA POWER climatology when available) scale the
 *    clear-sky energy to a realistic annual yield.
 */

import type { InverterInstance, InverterModel, ModuleModel, SiteTemps, StringDef } from "./equipment";

export interface LatLng {
  lat: number;
  lng: number;
}
export interface Vec2 {
  x: number;
  y: number;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ─── Design data (persisted as JSON) ────────────────────────────────────

export interface ModuleSpec {
  name: string;
  watt: number;
  /** Long side, metres. */
  length: number;
  /** Short side, metres. */
  width: number;
}

export type ZoneType = "flat" | "tilted" | "shed";

export interface Zone {
  id: string;
  name: string;
  points: LatLng[];
  /** flat = RCC roof with tilted mounting structure; tilted = sloped roof, modules flush-mounted;
   *  shed = elevated canopy structure (modules high above the roof, clear of parapets). */
  type: ZoneType;
  /** Roof (eave, for tilted roofs) height above ground, metres. */
  height: number;
  /** Tilted roof only: roof slope and the direction it faces. */
  roofTilt: number;
  roofAzimuth: number;
  /** Module tilt from horizontal, degrees. */
  tilt: number;
  /** Direction the modules face, degrees clockwise from north (180 = south). */
  azimuth: number;
  orientation: "portrait" | "landscape";
  /** Clear distance kept from the roof edge, metres. */
  setback: number;
  /** Gap between rows (horizontal, metres). null = auto (no inter-row shading 9 am–3 pm on the winter solstice). */
  rowGap: number | null;
  /** Gap between modules in a row, metres. */
  colGap: number;
  /** Height of the module's low edge above this roof surface, metres (structure height). */
  mountHeight: number;
  /** Parapet wall height around this roof, metres (0 = none). */
  parapetHeight: number;
  /** Module keys ("row:col") the user removed by hand. */
  removed: string[];
  /** Keep the panel direction square to the roof (recomputed from the outline when corners move).
   *  Turned off as soon as the user sets the direction by hand. */
  alignToRoof?: boolean;
  /** Array position chosen by the user (metres along the row, metres up the slope). Null = automatic best fit. */
  shift?: { u: number; w: number } | null;
  /** This zone's own module (e.g. a different wattage on one roof). Null = the design's module. */
  module?: ModuleSpec | null;
  moduleId?: string | null;
}

/** A module placed by hand, off the grid: dragged out of the array or added one by one. */
export interface FreePanel {
  id: string;
  zoneId: string;
  center: LatLng;
  /** Degrees added to the zone's panel azimuth (turn the module on the roof). */
  rotation: number;
  orientation: "portrait" | "landscape";
}

export type BlockerKind = "rect" | "polygon" | "circle" | "tree";

export interface Blocker {
  id: string;
  name: string;
  kind: BlockerKind;
  /** Outline for rect/polygon. */
  points: LatLng[];
  /** Centre + radius (m) for circle/tree. */
  center?: LatLng;
  radius?: number;
  /** The obstruction's own height, metres. */
  height: number;
  /** Height its bottom sits at above ground, metres (roof height for a tank on a roof, 0 for a tree in the yard). */
  base: number;
}

export interface DesignData {
  version: 1;
  center: LatLng;
  zoom: number;
  module: ModuleSpec;
  zones: Zone[];
  blockers: Blocker[];
  /** Performance ratio for energy estimates (inverter, wiring, temperature, soiling). */
  performanceRatio: number;
  /** Optional drone / orthophoto overlay. */
  overlay?: { url: string; bounds: [LatLng, LatLng]; opacity: number } | null;
  /** Modules placed by hand, outside the automatic grid. */
  freePanels?: FreePanel[];
  /** Catalog module id the `module` spec came from. */
  moduleId?: string;
  customModules?: ModuleModel[];
  customInverters?: InverterModel[];
  inverters?: InverterInstance[];
  strings?: StringDef[];
  temps?: SiteTemps;
  wiring?: {
    /** Where the inverter is mounted. */
    inverterAt?: LatLng | null;
    /** Inverter → meter/ACDB cable run, metres. */
    acRunM: number;
    dcSizeMm2: number | null;
    acSizeMm2: number | null;
  };
  units?: "m" | "ft";
}

export const DEFAULT_MODULE: ModuleSpec = { name: "540 Wp mono PERC (144 half-cell)", watt: 540, length: 2.278, width: 1.134 };

export function defaultZone(id: string, name: string, points: LatLng[], lat: number): Zone {
  return {
    id,
    name,
    points,
    type: "flat",
    alignToRoof: true,
    height: 6,
    roofTilt: 20,
    roofAzimuth: lat >= 0 ? 180 : 0,
    // Rule of thumb: tilt ≈ latitude, capped for wind load on Indian rooftops.
    tilt: Math.round(Math.min(Math.max(Math.abs(lat), 5), 25)),
    azimuth: lat >= 0 ? 180 : 0,
    orientation: "landscape",
    setback: 0.6,
    rowGap: null,
    colGap: 0.02,
    mountHeight: 0.5,
    parapetHeight: 0.9,
    removed: [],
  };
}

export function emptyDesign(center: LatLng): DesignData {
  return { version: 1, center, zoom: 20, module: { ...DEFAULT_MODULE }, zones: [], blockers: [], performanceRatio: 0.8, overlay: null };
}

// ─── Projection ─────────────────────────────────────────────────────────

const R_EARTH = 6378137;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export interface Projection {
  origin: LatLng;
  toLocal(p: LatLng): Vec2;
  toLatLng(v: Vec2): LatLng;
}

/** Local tangent-plane projection — sub-centimetre accurate over a few hundred metres. */
export function makeProjection(origin: LatLng): Projection {
  const kx = R_EARTH * D2R * Math.cos(origin.lat * D2R);
  const ky = R_EARTH * D2R;
  return {
    origin,
    toLocal: (p) => ({ x: (p.lng - origin.lng) * kx, y: (p.lat - origin.lat) * ky }),
    toLatLng: (v) => ({ lat: origin.lat + v.y / ky, lng: origin.lng + v.x / kx }),
  };
}

// ─── 2D geometry ────────────────────────────────────────────────────────

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const cross2 = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
const dot3 = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

export function polygonArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  return Math.abs(a) / 2;
}

export function polygonCentroid(pts: Vec2[]): Vec2 {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function segmentsIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): boolean {
  const r = sub(p2, p1), s = sub(q2, q1);
  const den = cross2(r, s);
  if (Math.abs(den) < 1e-12) return false;
  const qp = sub(q1, p1);
  const t = cross2(qp, s) / den, u = cross2(qp, r) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function segmentIntersectsPolygon(a: Vec2, b: Vec2, poly: Vec2[]): boolean {
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (segmentsIntersect(a, b, poly[j], poly[i])) return true;
  return false;
}

export function distPointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a), ap = sub(p, a);
  const len2 = ab.x * ab.x + ab.y * ab.y;
  const t = len2 ? Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / len2)) : 0;
  return Math.hypot(ap.x - ab.x * t, ap.y - ab.y * t);
}

function polygonsTooClose(a: Vec2[], b: Vec2[], clearance: number): boolean {
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return true;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++)
    for (let k = 0, l = b.length - 1; k < b.length; l = k++) {
      if (segmentsIntersect(a[j], a[i], b[l], b[k])) return true;
      if (clearance > 0 && (distPointSegment(a[i], b[l], b[k]) < clearance || distPointSegment(b[k], a[j], a[i]) < clearance)) return true;
    }
  return false;
}

/** Convex hull (monotone chain). */
export function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross2(sub(lower[lower.length - 1], lower[lower.length - 2]), sub(p, lower[lower.length - 2])) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross2(sub(upper[upper.length - 1], upper[upper.length - 2]), sub(p, upper[upper.length - 2])) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function circlePolygon(c: Vec2, r: number, n = 20): Vec2[] {
  return Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos((2 * Math.PI * i) / n), y: c.y + r * Math.sin((2 * Math.PI * i) / n) }));
}

// ─── Sun ────────────────────────────────────────────────────────────────

export interface SunPos {
  /** Degrees clockwise from north. */
  azimuth: number;
  /** Degrees above the horizon. */
  elevation: number;
}

/** NOAA general solar position (fractional-year method), atmospheric refraction included. */
export function sunPosition(date: Date, lat: number, lng: number): SunPos {
  const y = date.getUTCFullYear();
  const doy = Math.floor((date.getTime() - Date.UTC(y, 0, 1)) / 86400000) + 1;
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const daysInYear = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
  const g = ((2 * Math.PI) / daysInYear) * (doy - 1 + (hour - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hour * 60 + eqtime + 4 * lng;
  const ha = (tst / 4 - 180) * D2R;
  const phi = lat * D2R;
  const cosZ = Math.min(1, Math.max(-1, Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha)));
  const zen = Math.acos(cosZ);
  let elevation = 90 - zen * R2D;
  // Refraction (Saemundsson) — lifts the sun ~0.5° at the horizon.
  if (elevation > -1) elevation += 1.02 / Math.tan((elevation + 10.3 / (elevation + 5.11)) * D2R) / 60;
  let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) * R2D + 180;
  az = ((az % 360) + 360) % 360;
  return { azimuth: az, elevation };
}

/** Unit vector pointing from the ground towards the sun. */
export function sunVector(s: SunPos): Vec3 {
  const e = s.elevation * D2R, a = s.azimuth * D2R;
  return { x: Math.sin(a) * Math.cos(e), y: Math.cos(a) * Math.cos(e), z: Math.sin(e) };
}

/** Clear-sky irradiance (W/m²): Meinel DNI with Kasten–Young air mass, diffuse ≈ 10–14% of DNI. */
export function clearSky(elevationDeg: number): { dni: number; dhi: number } {
  if (elevationDeg <= 0) return { dni: 0, dhi: 0 };
  const zen = 90 - elevationDeg;
  const am = 1 / (Math.cos(zen * D2R) + 0.50572 * Math.pow(96.07995 - zen, -1.6364));
  const dni = 1361 * Math.pow(0.7, Math.pow(am, 0.678));
  const dhi = dni * (0.1 + 0.04 * (1 - Math.sin(elevationDeg * D2R)));
  return { dni, dhi };
}

/** Approximate standard-time offset (hours) from longitude, in half-hour steps (India → +5.5). */
export function tzOffsetFor(lng: number): number {
  if (lng >= 68 && lng <= 98) return 5.5; // India Standard Time
  return Math.round(lng / 7.5) / 2;
}

/** A Date for local clock time `hours` on a given day at the site. */
export function siteDate(year: number, month: number, day: number, hours: number, lng: number): Date {
  const utcMs = Date.UTC(year, month, day) + (hours - tzOffsetFor(lng)) * 3600000;
  return new Date(utcMs);
}

// ─── Scene build (layout + obstructions) ───────────────────────────────

export interface PanelGeom {
  index: number;
  zoneId: string;
  key: string;
  /** Plan-view footprint in local metres: low-left, low-right, high-right, high-left. */
  corners: Vec2[];
  /** 3D frame: origin at low-left corner, U along the row (horizontal), V up the slope. */
  O: Vec3;
  U: Vec3;
  V: Vec3;
  N: Vec3;
  /** Size along U and V, metres. */
  w: number;
  l: number;
  /** True when the module's long side runs along V (portrait). */
  longAlongV: boolean;
  removed: boolean;
  zTop: number;
  center: Vec2;
  /** Rated power of this module, W (zones can use different modules). */
  watt: number;
  /** Placed by hand (key is "free:<id>"). */
  free?: boolean;
  /** Hand-placed module that overlaps a roof edge, the setback, a blocker or another module. */
  clash?: string | null;
}

type Obstruction =
  | { kind: "prism"; poly: Vec2[]; zBot: number; zTop: number; c: Vec2; r: number; label: string }
  | { kind: "panel"; panel: PanelGeom; zTop: number; c: Vec2; r: number };

export interface Scene {
  proj: Projection;
  panels: PanelGeom[];
  obstructions: Obstruction[];
  zoneStats: { zoneId: string; areaM2: number; panelCount: number; kw: number; rowGap: number; azimuth: number; shiftNow: { u: number; w: number } }[];
}

/** Horizontal gap so a row never shades the next between 9 am and 3 pm solar time on the winter solstice. */
export function autoRowGap(lat: number, tiltDeg: number, slopeLen: number, azimuthDeg: number): number {
  const h = slopeLen * Math.sin(tiltDeg * D2R);
  if (h <= 0) return 0.3;
  const decl = (lat >= 0 ? -23.44 : 23.44) * D2R;
  const phi = lat * D2R;
  const f = { x: Math.sin(azimuthDeg * D2R), y: Math.cos(azimuthDeg * D2R) };
  let gap = 0;
  for (let haDeg = -45; haDeg <= 45; haDeg += 5) {
    const ha = haDeg * D2R;
    const sinE = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
    if (sinE <= 0.05) continue;
    const e = Math.asin(sinE);
    const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
    const along = (Math.sin(az) * f.x + Math.cos(az) * f.y) * (h / Math.tan(e));
    gap = Math.max(gap, along);
  }
  return Math.min(Math.max(0.3, Math.round(gap * 100) / 100), 6);
}

export function blockerFootprint(b: Blocker, proj: Projection): Vec2[] {
  if ((b.kind === "circle" || b.kind === "tree") && b.center) return circlePolygon(proj.toLocal(b.center), Math.max(0.1, b.radius ?? 1));
  return b.points.map(proj.toLocal);
}

/** Facing unit vector f, along-row unit vector r and up-slope horizontal unit vector b. */
function zoneAxes(azimuthDeg: number) {
  const A = azimuthDeg * D2R;
  const f = { x: Math.sin(A), y: Math.cos(A) };
  return { f, r: { x: Math.cos(A), y: -Math.sin(A) }, b: { x: -f.x, y: -f.y } };
}

/**
 * The direction panels should face so the array sits square to the roof: the outward normal of
 * one of the roof's longer edges, choosing the one that faces closest to the equator (south in
 * India). Turning panels 10-15 degrees off due south costs well under 1% of yield, and it's how
 * installers mount them, parallel to the parapet.
 */
export function roofAlignedAzimuth(points: LatLng[], lat: number): number | null {
  if (points.length < 3) return null;
  const k = Math.cos((points[0].lat * Math.PI) / 180);
  const pts = points.map((p) => ({ x: p.lng * k, y: p.lat }));
  const ideal = lat >= 0 ? 180 : 0;
  const edges = pts.map((a, i) => {
    const b2 = pts[(i + 1) % pts.length];
    return { len: Math.hypot(b2.x - a.x, b2.y - a.y), az: (Math.atan2(b2.x - a.x, b2.y - a.y) * 180) / Math.PI };
  });
  const longest = Math.max(...edges.map((e) => e.len));
  let best: number | null = null, bestDiff = Infinity;
  for (const e of edges) {
    if (e.len < longest * 0.3) continue; // ignore short jogs in the outline
    for (const n of [e.az + 90, e.az - 90]) {
      const az = ((n % 360) + 360) % 360;
      const diff = Math.abs(((az - ideal + 540) % 360) - 180);
      if (diff < bestDiff - 1e-9) { bestDiff = diff; best = Math.round(az * 10) / 10; }
    }
  }
  return best;
}

/** Module tilt / azimuth / gaps / structure height actually used for a zone, by roof type. */
export function effectiveZone(rawZone: Zone): Zone {
  let zone = rawZone;
  if (zone.alignToRoof) {
    const az = roofAlignedAzimuth(zone.points, zone.points[0]?.lat ?? 13);
    if (az !== null) zone = zone.type === "tilted" ? { ...zone, roofAzimuth: az } : { ...zone, azimuth: az };
  }
  if (zone.type === "tilted") return { ...zone, tilt: zone.roofTilt, azimuth: zone.roofAzimuth, rowGap: zone.rowGap ?? 0.02, mountHeight: Math.min(zone.mountHeight, 0.2), parapetHeight: 0 };
  return zone;
}

/** Roof surface height above ground at a plan point (sloped for tilted roofs). */
export function roofSurfaceZ(rawZone: Zone, p: Vec2, polyLocal: Vec2[]): number {
  const zone = rawZone.alignToRoof ? effectiveZone(rawZone) : rawZone;
  if (zone.type !== "tilted" || polyLocal.length < 3) return zone.height;
  const { b } = zoneAxes(zone.roofAzimuth);
  const minW = Math.min(...polyLocal.map((q) => q.x * b.x + q.y * b.y));
  return zone.height + Math.tan(zone.roofTilt * D2R) * (p.x * b.x + p.y * b.y - minW);
}

function layoutZone(rawZone: Zone, mod: ModuleSpec, proj: Projection, blockerPolys: Vec2[][], lat: number, startIndex: number) {
  const zone = effectiveZone(rawZone);
  const poly = zone.points.map(proj.toLocal);
  const out: PanelGeom[] = [];
  const portrait = zone.orientation === "portrait";
  const slopeLen = portrait ? mod.length : mod.width;
  const rowLen = portrait ? mod.width : mod.length;
  const t = zone.tilt * D2R;
  const depth = slopeLen * Math.cos(t);
  const rowGap = zone.rowGap ?? (zone.tilt > 0 ? autoRowGap(lat, zone.tilt, slopeLen, zone.azimuth) : 0.05);
  if (poly.length < 3) return { panels: out, rowGap, azimuth: zone.azimuth, shiftNow: { u: 0, w: 0 } };
  const { r, b } = zoneAxes(zone.azimuth);
  const toUW = (p: Vec2) => ({ u: p.x * r.x + p.y * r.y, w: p.x * b.x + p.y * b.y });
  const fromUW = (u: number, w: number): Vec2 => ({ x: u * r.x + w * b.x, y: u * r.y + w * b.y });
  const uw = poly.map(toUW);
  const minU = Math.min(...uw.map((p) => p.u)), maxU = Math.max(...uw.map((p) => p.u));
  const minW = Math.min(...uw.map((p) => p.w)), maxW = Math.max(...uw.map((p) => p.w));
  const colPitch = rowLen + zone.colGap;
  const rowPitch = depth + rowGap;
  const sb = Math.max(0, zone.setback);
  const removed = new Set(zone.removed);

  const fits = (c: Vec2[]) => {
    if (!c.every((p) => pointInPolygon(p, poly))) return false;
    if (poly.some((p) => pointInPolygon(p, c))) return false;
    for (const p of c) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (distPointSegment(p, poly[j], poly[i]) < sb - 1e-6) return false;
    for (const bp of blockerPolys) if (polygonsTooClose(c, bp, 0.3)) return false;
    return true;
  };

  // Try a few grid phases and keep the one that fits the most modules, unless the user has
  // positioned the array themselves (then use exactly their shift).
  let best: { u: number; w: number; row: number; col: number }[] = [];
  let bestPhase: [number, number] = [0, 0];
  const frac = (x: number) => ((x % 1) + 1) % 1;
  const phasePairs: [number, number][] = zone.shift
    ? [[frac(zone.shift.u / colPitch), frac(zone.shift.w / rowPitch)]]
    : [0, 0.25, 0.5, 0.75].flatMap((a) => [0, 0.25, 0.5, 0.75].map((b2) => [a, b2] as [number, number]));
  for (const [pu, pw] of phasePairs) {
    {
      const cells: { u: number; w: number; row: number; col: number }[] = [];
      let row = 0;
      for (let w = minW + sb + pw * rowPitch - rowPitch; w + depth <= maxW - sb + 1e-6; w += rowPitch, row++) {
        if (w < minW + sb - 1e-6) continue;
        let col = 0;
        for (let u = minU + sb + pu * colPitch - colPitch; u + rowLen <= maxU - sb + 1e-6; u += colPitch, col++) {
          if (u < minU + sb - 1e-6) continue;
          const c = [fromUW(u, w), fromUW(u + rowLen, w), fromUW(u + rowLen, w + depth), fromUW(u, w + depth)];
          if (fits(c)) cells.push({ u, w, row, col });
        }
      }
      if (cells.length > best.length || (zone.shift && !best.length)) { best = cells; bestPhase = [pu, pw]; }
    }
  }

  // Renumber rows/cols densely so removal keys stay stable regardless of the chosen phase.
  const rows = [...new Set(best.map((c) => Math.round(c.w * 1000)))].sort((a, b) => a - b);
  const cols = [...new Set(best.map((c) => Math.round(c.u * 1000)))].sort((a, b) => a - b);
  const surfaceAt = (p: Vec2) => roofSurfaceZ(zone, p, poly);
  const U: Vec3 = { x: r.x, y: r.y, z: 0 };
  const V: Vec3 = { x: b.x * Math.cos(t), y: b.y * Math.cos(t), z: Math.sin(t) };
  let N = cross3(U, V);
  if (N.z < 0) N = { x: -N.x, y: -N.y, z: -N.z };
  for (const c of best) {
    const key = `${rows.indexOf(Math.round(c.w * 1000))}:${cols.indexOf(Math.round(c.u * 1000))}`;
    const corners = [fromUW(c.u, c.w), fromUW(c.u + rowLen, c.w), fromUW(c.u + rowLen, c.w + depth), fromUW(c.u, c.w + depth)];
    const lowLeft = corners[0];
    const zBase = surfaceAt(lowLeft) + zone.mountHeight;
    out.push({
      index: startIndex + out.length,
      zoneId: zone.id,
      key,
      corners,
      O: { x: lowLeft.x, y: lowLeft.y, z: zBase },
      U,
      V,
      N,
      w: rowLen,
      l: slopeLen,
      longAlongV: portrait,
      removed: removed.has(key),
      zTop: zBase + slopeLen * Math.sin(t),
      center: polygonCentroid(corners),
      watt: mod.watt,
    });
  }
  // Where the grid sits now, as a shift the user can nudge from.
  return { panels: out, rowGap, azimuth: zone.azimuth, shiftNow: zone.shift ?? { u: bestPhase[0] * colPitch, w: bestPhase[1] * rowPitch } };
}

/** The module a zone uses: its own, or the design's. */
export function zoneModule(zone: Zone, design: DesignData): ModuleSpec {
  return zone.module ?? design.module;
}

/** Geometry for a hand-placed module, plus whether it clashes with the roof edge / setback / blockers. */
function freePanelGeom(fp: FreePanel, rawZone: Zone, mod: ModuleSpec, proj: Projection, blockerPolys: Vec2[][], index: number): PanelGeom {
  const zone = effectiveZone(rawZone);
  const poly = zone.points.map(proj.toLocal);
  const portrait = fp.orientation === "portrait";
  const slopeLen = portrait ? mod.length : mod.width;
  const rowLen = portrait ? mod.width : mod.length;
  const t = zone.tilt * D2R;
  const depth = slopeLen * Math.cos(t);
  const { r, b } = zoneAxes(zone.azimuth + (fp.rotation || 0));
  const c = proj.toLocal(fp.center);
  const at = (du: number, dw: number): Vec2 => ({ x: c.x + r.x * du + b.x * dw, y: c.y + r.y * du + b.y * dw });
  const corners = [at(-rowLen / 2, -depth / 2), at(rowLen / 2, -depth / 2), at(rowLen / 2, depth / 2), at(-rowLen / 2, depth / 2)];
  const U: Vec3 = { x: r.x, y: r.y, z: 0 };
  const V: Vec3 = { x: b.x * Math.cos(t), y: b.y * Math.cos(t), z: Math.sin(t) };
  let N = cross3(U, V);
  if (N.z < 0) N = { x: -N.x, y: -N.y, z: -N.z };
  const zBase = roofSurfaceZ(zone, corners[0], poly) + zone.mountHeight;
  let clash: string | null = null;
  if (poly.length >= 3) {
    if (!corners.every((p) => pointInPolygon(p, poly)) || poly.some((p) => pointInPolygon(p, corners))) clash = "Outside the roof";
    else if (corners.some((p) => poly.some((_, i) => distPointSegment(p, poly[(i + poly.length - 1) % poly.length], poly[i]) < Math.max(0, zone.setback) - 1e-6))) clash = "Inside the setback";
    else if (blockerPolys.some((bp) => polygonsTooClose(corners, bp, 0.3))) clash = "Too close to a blocker";
  }
  return {
    index, zoneId: rawZone.id, key: `free:${fp.id}`, corners, O: { x: corners[0].x, y: corners[0].y, z: zBase }, U, V, N,
    w: rowLen, l: slopeLen, longAlongV: portrait, removed: false, zTop: zBase + slopeLen * Math.sin(t), center: c, watt: mod.watt, free: true, clash,
  };
}

function cornersOverlap(a: Vec2[], b: Vec2[]): boolean {
  return polygonsTooClose(a, b, 0);
}

export function buildScene(design: DesignData): Scene {
  const proj = makeProjection(design.center);
  const lat = design.center.lat;
  const obstructions: Obstruction[] = [];
  const blockerPolys: Vec2[][] = [];
  for (const b of design.blockers) {
    const poly = blockerFootprint(b, proj);
    if (poly.length < 3) continue;
    blockerPolys.push(poly);
    const c = polygonCentroid(poly);
    obstructions.push({ kind: "prism", poly, zBot: b.base ?? 0, zTop: (b.base ?? 0) + b.height, c, r: Math.max(...poly.map((p) => Math.hypot(p.x - c.x, p.y - c.y))), label: b.name });
  }
  const panels: PanelGeom[] = [];
  const zoneStats: Scene["zoneStats"] = [];
  for (const z of design.zones) {
    const poly = z.points.map(proj.toLocal);
    if (poly.length >= 3 && z.parapetHeight > 0 && z.type !== "tilted") {
      // Parapet walls as thin prisms (20 cm thick) along every edge.
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j], bb = poly[i];
        const len = Math.hypot(bb.x - a.x, bb.y - a.y) || 1;
        const n = { x: (-(bb.y - a.y) / len) * 0.1, y: ((bb.x - a.x) / len) * 0.1 };
        const wall = [
          { x: a.x + n.x, y: a.y + n.y }, { x: bb.x + n.x, y: bb.y + n.y },
          { x: bb.x - n.x, y: bb.y - n.y }, { x: a.x - n.x, y: a.y - n.y },
        ];
        const c = { x: (a.x + bb.x) / 2, y: (a.y + bb.y) / 2 };
        obstructions.push({ kind: "prism", poly: wall, zBot: z.height, zTop: z.height + z.parapetHeight, c, r: len / 2 + 0.2, label: `${z.name} parapet` });
      }
    }
    const mod = zoneModule(z, design);
    const { panels: zp, rowGap, azimuth, shiftNow } = layoutZone(z, mod, proj, blockerPolys, lat, panels.length);
    panels.push(...zp);
    for (const fp of (design.freePanels ?? []).filter((f) => f.zoneId === z.id)) panels.push(freePanelGeom(fp, z, mod, proj, blockerPolys, panels.length));
    const zoneActive = panels.filter((p) => p.zoneId === z.id && !p.removed);
    zoneStats.push({
      zoneId: z.id, areaM2: poly.length >= 3 ? polygonArea(poly) : 0, panelCount: zoneActive.length,
      kw: zoneActive.reduce((a, p) => a + p.watt, 0) / 1000, rowGap, azimuth, shiftNow,
    });
  }
  // Hand-placed modules that sit on top of another module are flagged too.
  const live = panels.filter((p) => !p.removed);
  for (const p of live) {
    if (!p.free || p.clash) continue;
    if (live.some((q) => q !== p && Math.hypot(q.center.x - p.center.x, q.center.y - p.center.y) < Math.hypot(p.w, p.l) && cornersOverlap(p.corners, q.corners))) p.clash = "Overlaps another module";
  }
  for (const p of panels) {
    if (p.removed) continue;
    obstructions.push({ kind: "panel", panel: p, zTop: p.zTop, c: p.center, r: Math.hypot(p.w, p.l) / 2 + 0.05 });
  }
  return { proj, panels, obstructions, zoneStats };
}

// ─── Ray casting ───────────────────────────────────────────────────────

const MAX_REACH = 150; // metres — beyond this a rooftop obstruction can't matter above 1° sun

function rayBlocked(P: Vec3, s: Vec3, obs: Obstruction[], self: PanelGeom | null): boolean {
  const sxy = Math.hypot(s.x, s.y);
  for (const o of obs) {
    if (o.zTop <= P.z + 1e-6) continue;
    if (o.kind === "panel" && o.panel === self) continue;
    // Broad phase: can the ray reach this obstruction's bounding circle before climbing above it?
    const dx = o.c.x - P.x, dy = o.c.y - P.y;
    const dist = Math.hypot(dx, dy);
    const reach = Math.min(MAX_REACH, ((o.zTop - P.z) / s.z) * sxy);
    if (dist - o.r > reach) continue;
    if (dist > o.r && dx * s.x + dy * s.y < -o.r * sxy) continue;
    if (o.kind === "prism") {
      const ta = Math.max(0, (o.zBot - P.z) / s.z);
      const tb = Math.min((o.zTop - P.z) / s.z, ta + MAX_REACH / Math.max(sxy, 1e-6));
      if (tb <= ta) continue;
      const A = { x: P.x + s.x * ta, y: P.y + s.y * ta }, B = { x: P.x + s.x * tb, y: P.y + s.y * tb };
      if (segmentIntersectsPolygon(A, B, o.poly)) return true;
    } else {
      const p = o.panel;
      const den = dot3(s, p.N);
      if (Math.abs(den) < 1e-9) continue;
      const t = dot3({ x: p.O.x - P.x, y: p.O.y - P.y, z: p.O.z - P.z }, p.N) / den;
      if (t <= 1e-4) continue;
      const q = { x: P.x + s.x * t - p.O.x, y: P.y + s.y * t - p.O.y, z: P.z + s.z * t - p.O.z };
      const u = dot3(q, p.U), v = dot3(q, p.V);
      if (u >= 0 && u <= p.w && v >= 0 && v <= p.l) return true;
    }
  }
  return false;
}

/** Sample grid on a module: `across` columns per substring × 3 substrings across the short side, `along` rows along the long side. */
function panelSamples(p: PanelGeom, along: number, across: number) {
  const pts: { P: Vec3; substring: number }[] = [];
  const nShort = across * 3;
  for (let i = 0; i < nShort; i++)
    for (let j = 0; j < along; j++) {
      const sShort = (i + 0.5) / nShort, sLong = (j + 0.5) / along;
      const fu = p.longAlongV ? sShort : sLong;
      const fv = p.longAlongV ? sLong : sShort;
      pts.push({
        P: {
          x: p.O.x + p.U.x * p.w * fu + p.V.x * p.l * fv + p.N.x * 0.02,
          y: p.O.y + p.U.y * p.w * fu + p.V.y * p.l * fv + p.N.y * 0.02,
          z: p.O.z + p.U.z * p.w * fu + p.V.z * p.l * fv + p.N.z * 0.02,
        },
        substring: Math.floor(i / across),
      });
    }
  return pts;
}

export interface PanelShade {
  /** Fraction of module area in beam shadow. */
  shadedArea: number;
  /** Fraction of beam power lost after bypass-diode mismatch (≥ shadedArea). */
  electricalLoss: number;
}

function shadeOne(samples: { P: Vec3; substring: number }[], s: Vec3, obs: Obstruction[], self: PanelGeom): PanelShade {
  let hits = 0;
  const subHit = [false, false, false];
  for (const smp of samples) {
    if (rayBlocked(smp.P, s, obs, self)) {
      hits++;
      subHit[smp.substring] = true;
    }
  }
  return { shadedArea: hits / samples.length, electricalLoss: subHit.filter(Boolean).length / 3 };
}

/** Shading of every module at one instant (for the live sun scrubber). */
export function instantShading(scene: Scene, date: Date, lat: number, lng: number): { sun: SunPos; panels: (PanelShade | null)[] } {
  const sun = sunPosition(date, lat, lng);
  if (sun.elevation <= 0.5) return { sun, panels: scene.panels.map((p) => (p.removed ? null : { shadedArea: 1, electricalLoss: 1 })) };
  const s = sunVector(sun);
  return {
    sun,
    panels: scene.panels.map((p) => {
      if (p.removed) return null;
      if (dot3(s, p.N) <= 0) return { shadedArea: 1, electricalLoss: 1 }; // sun behind the module
      return shadeOne(panelSamples(p, 6, 2), s, scene.obstructions, p);
    }),
  };
}

/** Shadow outlines cast onto a horizontal plane at height planeZ (e.g. a roof) — for drawing. */
export function shadowPolygons(scene: Scene, sun: SunPos, planeZ = 0): Vec2[][] {
  if (sun.elevation <= 1) return [];
  const s = sunVector(sun);
  const k = 1 / Math.tan(sun.elevation * D2R);
  const dir = { x: -Math.sin(sun.azimuth * D2R), y: -Math.cos(sun.azimuth * D2R) };
  const proj = (p: Vec2, z: number) => {
    const d = Math.max(0, z - planeZ) * k;
    return { x: p.x + dir.x * d, y: p.y + dir.y * d };
  };
  void s;
  const out: Vec2[][] = [];
  for (const o of scene.obstructions) {
    if (o.zTop <= planeZ) continue;
    if (o.kind === "prism") {
      out.push(convexHull([...o.poly.map((p) => proj(p, Math.max(o.zBot, planeZ))), ...o.poly.map((p) => proj(p, o.zTop))]));
    } else {
      const p = o.panel;
      const c3 = [p.O, add3(p.O, p.U, p.w), add3(add3(p.O, p.U, p.w), p.V, p.l), add3(p.O, p.V, p.l)];
      out.push(convexHull(c3.map((c) => proj({ x: c.x, y: c.y }, c.z))));
    }
  }
  return out;
}

function add3(a: Vec3, b: Vec3, k: number): Vec3 {
  return { x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k };
}

/** Isotropic sky view factor for a module, reduced by the horizon its surroundings create. */
function skyViewFactor(p: PanelGeom, obs: Obstruction[]): number {
  const P: Vec3 = { x: p.center.x, y: p.center.y, z: (p.O.z + p.zTop) / 2 + 0.02 };
  const elevs = [3, 8, 14, 20, 28, 36, 46, 58, 72];
  let sum = 0, wsum = 0;
  for (let a = 0; a < 360; a += 15) {
    let horizon = 0;
    for (const e of elevs) {
      if (rayBlocked(P, sunVector({ azimuth: a, elevation: e }), obs, p)) horizon = e;
      else if (e > horizon + 10) break;
    }
    // Weight each direction by how much of it the tilted module actually sees.
    const look = sunVector({ azimuth: a, elevation: 30 });
    const w = Math.max(0.05, 1 + dot3(look, p.N));
    sum += w * Math.cos(horizon * D2R) ** 2;
    wsum += w;
  }
  const tiltFactor = (1 + p.N.z) / 2;
  return tiltFactor * (sum / wsum);
}

// ─── Annual analysis ───────────────────────────────────────────────────

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface PanelResult {
  index: number;
  key: string;
  zoneId: string;
  /** Delivered / unshaded energy, 0–1 (electrical, includes bypass-diode mismatch and diffuse loss). */
  solarAccess: number;
  /** Purely geometric (area-weighted) shading, 0–1 — what simple tools report. */
  geometricAccess: number;
  skyView: number;
  annualKwh: number;
}

export interface AnalysisResult {
  panels: PanelResult[];
  /** % energy lost to shading (electrical model). */
  shadingLossPct: number;
  /** % lost if you only count shaded area (for comparison). */
  geometricLossPct: number;
  monthlyLossPct: number[];
  monthlyKwh: number[];
  annualKwh: number;
  /** Annual kWh per kWp. */
  specificYield: number;
  systemKw: number;
}

export interface AnalysisOptions {
  /** Measured monthly mean all-sky GHI, kWh/m²/day (e.g. NASA POWER). Preferred: anchors energy to real weather. */
  monthlyGhi?: number[];
  /** Fallback: monthly all-sky / clear-sky ratio (12 values). Default 0.75 all year. */
  monthlyClearness?: number[];
  stepMinutes?: number;
  year?: number;
}

export function annualAnalysis(design: DesignData, scene: Scene = buildScene(design), opts: AnalysisOptions = {}): AnalysisResult {
  const { lat, lng } = design.center;
  const step = opts.stepMinutes ?? 30;
  const year = opts.year ?? 2025;
  const clear = opts.monthlyClearness ?? Array(12).fill(0.75);
  const active = scene.panels.filter((p) => !p.removed);
  const kwOf = (p: PanelGeom) => p.watt / 1000;
  const pr = design.performanceRatio || 0.8;
  const samples = active.map((p) => panelSamples(p, 5, 1));
  const svf = active.map((p) => skyViewFactor(p, scene.obstructions));
  const unsh = active.map(() => 0), geo = active.map(() => 0), elec = active.map(() => 0);
  const mUnsh = Array(12).fill(0), mElec = Array(12).fill(0), mKwh = Array(12).fill(0);
  const noonUtc = 12 - lng / 15;
  const hours: number[] = [];
  for (let h = noonUtc - 8; h <= noonUtc + 8; h += step / 60) hours.push(h);

  for (let m = 0; m < 12; m++) {
    // Each month represented by its mid-month day, weighted by days in month.
    const dayW = DAYS_IN_MONTH[m] * (step / 60) / 1000; // → kWh/m² per W/m²
    const doy = Math.round((Date.UTC(year, m, 15) - Date.UTC(year, 0, 1)) / 86400000) + 1;
    const suns = hours.map((h) => sunPosition(new Date(Date.UTC(year, m, 15) + h * 3600000), lat, lng));
    // Weather scaling. With measured GHI: split it into beam/diffuse with the Liu–Jordan monthly
    // correlation and scale the clear-sky beam and diffuse separately — cloudy months get more
    // diffuse light, which shadows barely affect, so their shading loss is correctly lower.
    let beamScale = clear[m], diffScale = clear[m];
    if (opts.monthlyGhi?.[m]) {
      let bH = 0, dH = 0, h0 = 0;
      const e0 = 1361 * (1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365));
      for (const sp of suns) {
        if (sp.elevation <= 0) continue;
        const sinE = Math.sin(sp.elevation * D2R);
        h0 += e0 * sinE;
        if (sp.elevation < 2) continue;
        const cs = clearSky(sp.elevation);
        bH += cs.dni * sinE;
        dH += cs.dhi;
      }
      const toDay = step / 60 / 1000;
      const ghi = opts.monthlyGhi[m];
      const kt = Math.min(0.8, Math.max(0.2, ghi / (h0 * toDay)));
      const kd = Math.min(0.9, Math.max(0.1, 1.39 - 4.027 * kt + 5.531 * kt * kt - 3.108 * kt ** 3));
      beamScale = bH ? (ghi * (1 - kd)) / (bH * toDay) : 0;
      diffScale = dH ? (ghi * kd) / (dH * toDay) : 0;
    }
    for (const sun of suns) {
      if (sun.elevation < 2) continue;
      const s = sunVector(sun);
      const cs = clearSky(sun.elevation);
      const dni = cs.dni * beamScale, dhi = cs.dhi * diffScale;
      active.forEach((p, i) => {
        const cosI = Math.max(0, dot3(s, p.N));
        const beam = dni * cosI;
        const diffFree = dhi * (1 + p.N.z) / 2;
        const diffShaded = dhi * svf[i];
        const u = (beam + diffFree) * dayW;
        let g = u, e = u;
        if (beam > 0) {
          const sh = shadeOne(samples[i], s, scene.obstructions, p);
          g = (beam * (1 - sh.shadedArea) + diffShaded) * dayW;
          e = (beam * (1 - sh.electricalLoss) + diffShaded) * dayW;
        } else {
          g = e = diffShaded * dayW;
        }
        unsh[i] += u; geo[i] += g; elec[i] += e;
        mUnsh[m] += u; mElec[m] += e;
        mKwh[m] += e * kwOf(p) * pr;
      });
    }
  }
  const panels: PanelResult[] = active.map((p, i) => ({
    index: p.index,
    key: p.key,
    zoneId: p.zoneId,
    solarAccess: unsh[i] ? elec[i] / unsh[i] : 1,
    geometricAccess: unsh[i] ? geo[i] / unsh[i] : 1,
    skyView: svf[i],
    annualKwh: elec[i] * kwOf(p) * pr,
  }));
  const tU = unsh.reduce((a, b) => a + b, 0), tE = elec.reduce((a, b) => a + b, 0), tG = geo.reduce((a, b) => a + b, 0);
  const annualKwh = mKwh.reduce((a, b) => a + b, 0);
  const systemKw = active.reduce((a, p) => a + kwOf(p), 0);
  return {
    panels,
    shadingLossPct: tU ? (1 - tE / tU) * 100 : 0,
    geometricLossPct: tU ? (1 - tG / tU) * 100 : 0,
    monthlyLossPct: mUnsh.map((u, m) => (u ? (1 - mElec[m] / u) * 100 : 0)),
    monthlyKwh: mKwh,
    annualKwh,
    specificYield: systemKw ? annualKwh / systemKw : 0,
    systemKw,
  };
}

/** Sun path for a day — for the sun-path diagram. */
export function sunPath(lat: number, lng: number, year: number, month: number, day: number): SunPos[] {
  const out: SunPos[] = [];
  for (let h = 4; h <= 20; h += 0.25) {
    const s = sunPosition(siteDate(year, month, day, h, lng), lat, lng);
    if (s.elevation > 0) out.push(s);
  }
  return out;
}

/** Colour for a solar-access value (heatmap legend). */
export function accessColor(access: number): string {
  if (access >= 0.95) return "#16a34a";
  if (access >= 0.9) return "#84cc16";
  if (access >= 0.8) return "#eab308";
  if (access >= 0.7) return "#f97316";
  return "#dc2626";
}

export function designSummary(design: DesignData, scene: Scene = buildScene(design)) {
  const panelCount = scene.zoneStats.reduce((a, z) => a + z.panelCount, 0);
  return {
    panelCount,
    systemKw: Math.round(scene.zoneStats.reduce((a, z) => a + z.kw, 0) * 100) / 100,
    areaM2: Math.round(scene.zoneStats.reduce((a, z) => a + z.areaM2, 0) * 100) / 100,
  };
}

/** Defensive parse of stored design JSON. */
export function parseDesign(raw: unknown, fallbackCenter: LatLng): DesignData {
  const d = (raw && typeof raw === "object" ? raw : {}) as Partial<DesignData>;
  const base = emptyDesign(d.center ?? fallbackCenter);
  return {
    ...base,
    ...d,
    version: 1,
    module: { ...DEFAULT_MODULE, ...(d.module ?? {}) },
    zones: (d.zones ?? []).map((z) => {
      const merged = { ...defaultZone(z.id, z.name, z.points, base.center.lat), ...z };
      // Designs saved before roof alignment existed: follow the roof only if nobody changed the
      // direction from the default (an intentional direction is kept).
      if (z.alignToRoof === undefined) {
        const untouched = (merged.type === "tilted" ? merged.roofAzimuth : merged.azimuth) === (base.center.lat >= 0 ? 180 : 0);
        merged.alignToRoof = untouched;
      }
      return merged;
    }),
    blockers: (d.blockers ?? []).map((b) => ({ ...b, base: b.base ?? 0 })),
  };
}

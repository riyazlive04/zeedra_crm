import { describe, expect, it } from "vitest";
import {
  annualAnalysis,
  autoRowGap,
  buildScene,
  defaultZone,
  emptyDesign,
  instantShading,
  makeProjection,
  siteDate,
  sunPosition,
  type DesignData,
} from "@/lib/solar/shading";

const CHENNAI = { lat: 13.0827, lng: 80.2707 };

/** A square roof of `side` metres centred on the origin. */
function squareRoof(design: DesignData, side: number) {
  const proj = makeProjection(design.center);
  const h = side / 2;
  return [
    { x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h },
  ].map(proj.toLatLng);
}

describe("sun position (NOAA)", () => {
  it("matches reference values for Chennai", () => {
    // Equinox solar noon: elevation ≈ 90 − lat (+ tiny declination offset), sun due south.
    const noon = sunPosition(new Date(Date.UTC(2025, 2, 20, 6, 50)), CHENNAI.lat, CHENNAI.lng);
    expect(noon.elevation).toBeGreaterThan(76);
    expect(noon.elevation).toBeLessThan(78);
    // June solstice noon at 13°N: sun is NORTH of zenith (az ≈ 0/360).
    const june = sunPosition(new Date(Date.UTC(2025, 5, 21, 6, 40)), CHENNAI.lat, CHENNAI.lng);
    expect(june.azimuth < 30 || june.azimuth > 330).toBe(true);
    expect(june.elevation).toBeGreaterThan(78);
    // Morning sun is in the east.
    const morning = sunPosition(siteDate(2025, 11, 21, 8, CHENNAI.lng), CHENNAI.lat, CHENNAI.lng);
    expect(morning.azimuth).toBeGreaterThan(100);
    expect(morning.azimuth).toBeLessThan(140);
  });
});

describe("layout", () => {
  it("fills a 10 m square roof and respects setback", () => {
    const d = emptyDesign(CHENNAI);
    d.zones.push({ ...defaultZone("z1", "Roof", squareRoof(d, 10), CHENNAI.lat), parapetHeight: 0 });
    const scene = buildScene(d);
    const n = scene.panels.length;
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThan(30);
    for (const p of scene.panels) for (const c of p.corners) expect(Math.max(Math.abs(c.x), Math.abs(c.y))).toBeLessThanOrEqual(5 - 0.6 + 1e-6);
  });

  it("auto row gap grows with tilt", () => {
    expect(autoRowGap(13, 25, 1.134, 180)).toBeGreaterThan(autoRowGap(13, 10, 1.134, 180));
  });

  it("skips modules under a blocker", () => {
    const d = emptyDesign(CHENNAI);
    d.zones.push({ ...defaultZone("z1", "Roof", squareRoof(d, 10), CHENNAI.lat), parapetHeight: 0 });
    const before = buildScene(d).panels.length;
    d.blockers.push({ id: "b", name: "Tank", kind: "circle", points: [], center: CHENNAI, radius: 1.5, height: 2, base: 6 });
    expect(buildScene(d).panels.length).toBeLessThan(before);
  });
});

describe("shading", () => {
  it("an open roof with auto row gap has little loss", () => {
    const d = emptyDesign(CHENNAI);
    d.zones.push({ ...defaultZone("z1", "Roof", squareRoof(d, 12), CHENNAI.lat), parapetHeight: 0 });
    const r = annualAnalysis(d);
    expect(r.shadingLossPct).toBeLessThan(4);
    // Clear-sky × 0.75 × PR 0.8 → a realistic Indian specific yield.
    expect(r.specificYield).toBeGreaterThan(1200);
    expect(r.specificYield).toBeLessThan(1900);
  });

  it("a tall tower south-east of the array causes real loss, worst on the nearest modules", () => {
    const d = emptyDesign(CHENNAI);
    d.zones.push({ ...defaultZone("z1", "Roof", squareRoof(d, 12), CHENNAI.lat), parapetHeight: 0 });
    const proj = makeProjection(d.center);
    const tower = [{ x: 7, y: -9 }, { x: 10, y: -9 }, { x: 10, y: -6 }, { x: 7, y: -6 }].map(proj.toLatLng);
    d.blockers.push({ id: "t", name: "Tower", kind: "rect", points: tower, height: 12, base: 6 });
    const r = annualAnalysis(d);
    expect(r.shadingLossPct).toBeGreaterThan(2);
    const worst = r.panels.reduce((a, b) => (a.solarAccess < b.solarAccess ? a : b));
    expect(worst.solarAccess).toBeLessThan(0.9);
    // Electrical (bypass-diode) loss is never smaller than area-only loss.
    expect(r.shadingLossPct).toBeGreaterThanOrEqual(r.geometricLossPct - 1e-9);
  });

  it("a tight row gap creates inter-row shading in winter mornings", () => {
    const d = emptyDesign(CHENNAI);
    d.zones.push({ ...defaultZone("z1", "Roof", squareRoof(d, 12), CHENNAI.lat), parapetHeight: 0, rowGap: 0.05, tilt: 25, orientation: "portrait" });
    const scene = buildScene(d);
    const res = instantShading(scene, siteDate(2025, 11, 21, 8.5, CHENNAI.lng), CHENNAI.lat, CHENNAI.lng);
    expect(res.panels.some((p) => p && p.shadedArea > 0)).toBe(true);
  });

  it("a parapet shades edge modules when the structure is low", () => {
    const d = emptyDesign(CHENNAI);
    const z = { ...defaultZone("z1", "Roof", squareRoof(d, 10), CHENNAI.lat), parapetHeight: 1.2, mountHeight: 0.1, setback: 0.3 };
    d.zones.push(z);
    const low = annualAnalysis(d).shadingLossPct;
    d.zones[0] = { ...z, mountHeight: 1.5 };
    const high = annualAnalysis(d).shadingLossPct;
    expect(low).toBeGreaterThan(high);
  });
});

describe("roof types", () => {
  it("tilted roof mounts modules flush at the roof slope", () => {
    const d = emptyDesign(CHENNAI);
    d.zones.push({ ...defaultZone("z1", "Roof", squareRoof(d, 10), CHENNAI.lat), type: "tilted", roofTilt: 22, roofAzimuth: 180, height: 4 });
    const scene = buildScene(d);
    expect(scene.panels.length).toBeGreaterThan(8);
    const p = scene.panels[0];
    expect(Math.round(Math.asin(p.N.z === 1 ? 0 : Math.hypot(p.N.x, p.N.y)) * 180 / Math.PI)).toBe(22);
    // Higher rows sit higher up the slope.
    const zs = scene.panels.map((q) => q.O.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(1);
  });
});

describe("weather calibration", () => {
  it("anchors yield to measured GHI and lowers shading loss in cloudy months", () => {
    const d = emptyDesign(CHENNAI);
    d.zones.push({ ...defaultZone("z1", "Roof", squareRoof(d, 12), CHENNAI.lat), parapetHeight: 0 });
    const proj = makeProjection(d.center);
    d.blockers.push({ id: "t", name: "Tower", kind: "rect", points: [{ x: 7, y: -9 }, { x: 10, y: -9 }, { x: 10, y: -6 }, { x: 7, y: -6 }].map(proj.toLatLng), height: 12, base: 6 });
    // Chennai NASA POWER climatology, kWh/m²/day (approx.)
    const ghi = [4.9, 5.8, 6.4, 6.6, 6.3, 5.6, 5.1, 5.2, 5.3, 4.6, 4.1, 4.3];
    const r = annualAnalysis(d, undefined, { monthlyGhi: ghi });
    // Annual GHI ≈ 1,960 kWh/m²; low tilt adds little → specific yield ≈ GHI × PR 0.8 ≈ 1,450–1,650.
    expect(r.specificYield).toBeGreaterThan(1400);
    expect(r.specificYield).toBeLessThan(1700);
    const clear = annualAnalysis(d, undefined, { monthlyClearness: Array(12).fill(1) });
    expect(r.shadingLossPct).toBeLessThan(clear.shadingLossPct);
  });
});

describe("panel placement controls", () => {
  /** A 12 m × 8 m roof turned 15° clockwise from north. */
  function rotatedRoof(d: DesignData) {
    const proj = makeProjection(d.center);
    const a = (15 * Math.PI) / 180;
    const rot = (x: number, y: number) => ({ x: x * Math.cos(a) + y * Math.sin(a), y: -x * Math.sin(a) + y * Math.cos(a) });
    return [rot(-6, -4), rot(6, -4), rot(6, 4), rot(-6, 4)].map(proj.toLatLng);
  }

  it("lines panels up with a turned roof", () => {
    const d = emptyDesign(CHENNAI);
    d.zones.push({ ...defaultZone("z1", "Roof", rotatedRoof(d), CHENNAI.lat), parapetHeight: 0 });
    const scene = buildScene(d);
    expect(scene.panels.length).toBeGreaterThan(6);
    // Row direction (U) parallel to the roof's long edge, which runs at 105° (bearing) after the turn.
    const p = scene.panels[0];
    const bearing = ((Math.atan2(p.U.x, p.U.y) * 180) / Math.PI + 360) % 180;
    expect(Math.abs(bearing - 105)).toBeLessThan(0.5);
    // A zone with alignment off keeps due south and fits fewer panels on the turned roof.
    const off = emptyDesign(CHENNAI);
    off.zones.push({ ...defaultZone("z1", "Roof", rotatedRoof(off), CHENNAI.lat), parapetHeight: 0, alignToRoof: false });
    expect(buildScene(off).panels.length).toBeLessThanOrEqual(scene.panels.length);
  });

  it("moves the array by the user's shift", () => {
    const d = emptyDesign(CHENNAI);
    d.zones.push({ ...defaultZone("z1", "Roof", squareRoof(d, 12), CHENNAI.lat), parapetHeight: 0, shift: { u: 0, w: 0 } });
    const a = buildScene(d).panels[0].center;
    d.zones[0] = { ...d.zones[0], shift: { u: 0.3, w: 0 } };
    const b = buildScene(d).panels[0].center;
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(0.3, 1);
  });

  it("places hand-placed panels and flags clashes", () => {
    const d = emptyDesign(CHENNAI);
    d.zones.push({ ...defaultZone("z1", "Roof", squareRoof(d, 12), CHENNAI.lat), parapetHeight: 0 });
    const proj = makeProjection(d.center);
    d.freePanels = [
      { id: "a", zoneId: "z1", center: proj.toLatLng({ x: 0, y: 0 }), rotation: 0, orientation: "portrait" },
      { id: "b", zoneId: "z1", center: proj.toLatLng({ x: 20, y: 0 }), rotation: 30, orientation: "landscape" },
    ];
    const free = buildScene(d).panels.filter((p) => p.free);
    expect(free).toHaveLength(2);
    expect(free[1].clash).toBe("Outside the roof");
    // "a" sits in the middle of the auto grid, so it overlaps a grid module.
    expect(free[0].clash).toBe("Overlaps another module");
  });

  it("uses each zone's own module for kW", () => {
    const d = emptyDesign(CHENNAI);
    d.zones.push({ ...defaultZone("z1", "Roof", squareRoof(d, 12), CHENNAI.lat), parapetHeight: 0, module: { name: "335 W", watt: 335, length: 1.956, width: 0.992 } });
    const scene = buildScene(d);
    const st = scene.zoneStats[0];
    expect(st.kw).toBeCloseTo((st.panelCount * 335) / 1000, 5);
    expect(scene.panels.every((p) => p.watt === 335)).toBe(true);
  });
});

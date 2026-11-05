import { describe, expect, it } from "vitest";
import { autoString, checkString, dcVoltageDrop, findInverter, findModule, MODULES, INVERTERS, stringLimits, suggestInverter } from "@/lib/solar/equipment";

const mod = findModule("waaree-arka-540")!;
const temps = { minC: 10, maxC: 40 };

describe("catalog", () => {
  it("has sane, unique entries", () => {
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
    expect(new Set(INVERTERS.map((m) => m.id)).size).toBe(INVERTERS.length);
    for (const m of MODULES) {
      expect(m.vmp).toBeLessThan(m.voc);
      expect(m.imp).toBeLessThan(m.isc);
      expect(Math.abs(m.vmp * m.imp - m.watt) / m.watt).toBeLessThan(0.03);
      expect(m.efficiency).toBeGreaterThan(15);
      expect(m.efficiency).toBeLessThan(24);
    }
  });
});

describe("string sizing", () => {
  it("computes limits with cold Voc and hot Vmp", () => {
    const lim = stringLimits(mod, findInverter("growatt-min-5000")!, temps);
    expect(lim.vocCold).toBeGreaterThan(mod.voc);
    expect(lim.vmpHot).toBeLessThan(mod.vmp);
    expect(lim.max).toBe(10); // 550 V / ~51.6 V
    expect(lim.min).toBeGreaterThanOrEqual(3);
  });

  it("auto-strings 16 modules on a 2-MPPT inverter into 2×8", () => {
    const panels = Array.from({ length: 16 }, (_, i) => `z|0:${i}`);
    const iv = findInverter("growatt-min-6000")!;
    const r = autoString(panels, mod, [{ inst: { id: "i1", modelId: iv.id }, model: iv }], temps);
    expect(r.strings.map((s) => s.panels.length)).toEqual([8, 8]);
    expect(r.strings.map((s) => s.mppt)).toEqual([0, 1]);
    expect(r.unstrung).toHaveLength(0);
    for (const s of r.strings) expect(checkString(s, r.strings, mod, iv, temps).ok).toBe(true);
  });

  it("flags an over-voltage string", () => {
    const iv = findInverter("growatt-min-3000")!;
    const s = { id: "S1", inverterIndex: 0, mppt: 0, panels: Array.from({ length: 12 }, (_, i) => `p${i}`) };
    expect(checkString(s, [s], mod, iv, temps).ok).toBe(false);
  });

  it("suggests a right-sized inverter", () => {
    expect(suggestInverter(4.32, "single")!.acKw).toBeGreaterThanOrEqual(3.2);
    expect(suggestInverter(12, "three")!.phase).toBe("three");
  });

  it("computes DC voltage drop", () => {
    const d = dcVoltageDrop(20, 13, 4, 330);
    expect(d.volts).toBeCloseTo((2 * 20 * 13 * 0.0216) / 4, 6);
    expect(d.pct).toBeLessThan(2);
  });
});

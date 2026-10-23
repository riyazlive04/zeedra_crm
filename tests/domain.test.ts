import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as S, parseSettings } from "@/lib/settings";
import { centralSubsidy, pickInverterKw, sizeSystem, unitsFromBill } from "@/lib/solar/sizing";
import { emi, loanPlan } from "@/lib/solar/finance";
import { basicQualification, salesScore } from "@/lib/qualification";
import { haversineM, validateFieldCapture } from "@/lib/geo";
import { normalizePhone, parseCSV, renderTemplate, formatINRCompact } from "@/lib/text";

describe("subsidy (PM Surya Ghar)", () => {
  it("pays 30k/kW for first 2 kW, 18k for 3rd, capped at 78k", () => {
    expect(centralSubsidy(1, "RESIDENTIAL")).toBe(30000);
    expect(centralSubsidy(2, "RESIDENTIAL")).toBe(60000);
    expect(centralSubsidy(2.5, "RESIDENTIAL")).toBe(69000);
    expect(centralSubsidy(3, "RESIDENTIAL")).toBe(78000);
    expect(centralSubsidy(10, "RESIDENTIAL")).toBe(78000);
  });
  it("pays 18k/kW for housing societies and nothing for commercial", () => {
    expect(centralSubsidy(20, "HOUSING_SOCIETY")).toBe(360000);
    expect(centralSubsidy(600, "HOUSING_SOCIETY")).toBe(500 * 18000);
    expect(centralSubsidy(50, "COMMERCIAL")).toBe(0);
  });
});

describe("system sizing", () => {
  it("derives units from bill", () => {
    expect(unitsFromBill(2520, S)).toBeCloseTo((2520 - S.fixedChargesMonthly) / S.tariffPerUnit);
  });

  it("sizes a ₹3,000/month home to ~3 kW with correct panel maths", () => {
    const r = sizeSystem({ monthlyBill: 3000, segment: "RESIDENTIAL" }, S);
    expect(r.monthlyUnits).toBe(360);
    expect(r.requiredKw).toBeCloseTo(3.09, 1);
    expect(r.panelCount).toBe(Math.ceil(3000 / 550));
    expect(r.recommendedKw).toBeCloseTo(3.3, 2);
    expect(r.subsidy).toBe(100000); // ₹78k central (PM Surya Ghar) + ₹22k state top-up (TN G.O. 102, 3kW+ tier)
    expect(r.totalCost).toBe(r.subtotal + r.gstAmount);
    expect(r.netCost).toBe(r.totalCost - r.subsidy);
    expect(r.paybackYears).toBeGreaterThan(1);
    expect(r.paybackYears).toBeLessThan(8);
    expect(r.savings25Years).toBeGreaterThan(r.annualSavings * 25);
  });

  it("prefers units over bill and respects override", () => {
    const r = sizeSystem({ monthlyBill: 9999, monthlyUnits: 120, overrideKw: 5 }, S);
    expect(r.monthlyUnits).toBe(120);
    expect(r.recommendedKw).toBeGreaterThanOrEqual(5);
  });

  it("caps to roof area and warns", () => {
    const r = sizeSystem({ monthlyUnits: 1000, roofAreaSqft: 300 }, S);
    expect(r.roofLimitedKw).toBe(3);
    expect(r.recommendedKw).toBeLessThanOrEqual(3.3);
    expect(r.warnings.join(" ")).toMatch(/roof fits/);
  });

  it("warns on sanctioned load and single phase", () => {
    const r = sizeSystem({ monthlyUnits: 900, sanctionedLoadKw: 4, phase: "SINGLE" }, S);
    expect(r.warnings.some((w) => w.includes("load enhancement"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("three-phase"))).toBe(true);
  });

  it("applies discount before GST and never goes negative", () => {
    const base = sizeSystem({ monthlyUnits: 300 }, S);
    const disc = sizeSystem({ monthlyUnits: 300, discount: 10000 }, S);
    expect(disc.gstAmount).toBeLessThan(base.gstAmount);
    expect(sizeSystem({ monthlyUnits: 300, discount: 1e9 }, S).totalCost).toBe(0);
  });

  it("picks standard inverter sizes", () => {
    expect(pickInverterKw(3.3)).toBe(3);
    expect(pickInverterKw(5.5)).toBe(5);
    expect(pickInverterKw(10.45)).toBe(10);
  });
});

describe("finance", () => {
  it("computes EMI with reducing balance", () => {
    expect(emi(100000, 12, 12)).toBe(8885);
    expect(emi(120000, 0, 12)).toBe(10000);
    expect(emi(0, 7, 60)).toBe(0);
  });
  it("builds a loan plan with cashflow", () => {
    const p = loanPlan(150000, 3000, 7, 84, 10);
    expect(p.downPayment).toBe(15000);
    expect(p.loanAmount).toBe(135000);
    expect(p.monthlyCashflow).toBe(3000 - p.emi);
  });
});

describe("qualification", () => {
  it("qualifies an owner with a healthy bill", () => {
    const r = basicQualification({ monthlyBill: 2500, ownsProperty: true, segment: "RESIDENTIAL" }, S);
    expect(r.status).toBe("QUALIFIED");
  });
  it("disqualifies tenants and low bills", () => {
    const r = basicQualification({ monthlyBill: 500, ownsProperty: false, segment: "RESIDENTIAL" }, S);
    expect(r.status).toBe("DISQUALIFIED");
    expect(r.reasons).toHaveLength(2);
  });
  it("is incomplete when data is missing", () => {
    expect(basicQualification({ segment: "RESIDENTIAL" }, S).status).toBe("INCOMPLETE");
  });
  it("lets commercial tenants through with a warning", () => {
    const r = basicQualification({ monthlyBill: 20000, ownsProperty: false, segment: "COMMERCIAL" }, S);
    expect(r.status).toBe("QUALIFIED");
    expect(r.warnings[0]).toMatch(/NOC/);
  });

  it("scores a ready, funded, immediate lead HOT", () => {
    const lead = {
      monthlyBill: 4000,
      ownsProperty: true,
      siteVisitReady: true,
      installationTimeline: "IMMEDIATE",
      paymentMode: "CASH",
      decisionMakerMet: true,
      lastContactAt: new Date(),
    };
    const r = salesScore(lead, S, basicQualification(lead, S));
    expect(r.temperature).toBe("HOT");
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it("scores an exploring lead with finance objection COLD and suggests a loan", () => {
    const lead = { monthlyBill: 1500, installationTimeline: "EXPLORING", siteVisitReady: false, objection: "FINANCE" };
    const r = salesScore(lead, S);
    expect(r.temperature).toBe("COLD");
    expect(r.nextActions.join(" ")).toMatch(/loan/i);
  });

  it("finance via loan makes a lead WARM", () => {
    const lead = {
      monthlyBill: 2500,
      installationTimeline: "WITHIN_1_MONTH",
      siteVisitReady: true,
      paymentMode: "LOAN",
      loanStatus: "DOCS_PENDING",
    };
    expect(salesScore(lead, S).temperature).toBe("WARM");
  });

  it("forces COLD when basic qualification failed", () => {
    const lead = { installationTimeline: "IMMEDIATE", siteVisitReady: true, paymentMode: "CASH", monthlyBill: 300, ownsProperty: false };
    const r = salesScore(lead, S, basicQualification(lead, S));
    expect(r.temperature).toBe("COLD");
    expect(r.score).toBeLessThanOrEqual(15);
  });
});

describe("GPS & time validation", () => {
  const site = { lat: 13.0827, lng: 80.2707, pinned: true }; // Chennai
  const now = new Date("2026-10-22T10:30:00Z");
  const appt = { startAt: new Date("2026-10-22T10:00:00Z"), endAt: new Date("2026-10-22T11:00:00Z") };

  it("haversine is accurate", () => {
    expect(haversineM({ lat: 13.0827, lng: 80.2707 }, { lat: 12.9716, lng: 77.5946 })).toBeGreaterThan(289000);
    expect(haversineM({ lat: 13.0827, lng: 80.2707 }, { lat: 12.9716, lng: 77.5946 })).toBeLessThan(292000);
  });

  it("verifies a capture at site, on time, accurate clock", () => {
    const r = validateFieldCapture(
      { capture: { lat: 13.0829, lng: 80.2709, accuracyM: 15, deviceTime: now }, serverTime: now, site, appointment: appt },
      S,
    );
    expect(r.verdict).toBe("VERIFIED");
    expect(r.distanceM).toBeLessThan(50);
  });

  it("flags out-of-range captures", () => {
    const r = validateFieldCapture(
      { capture: { lat: 13.1, lng: 80.3, accuracyM: 10, deviceTime: now }, serverTime: now, site, appointment: appt },
      S,
    );
    expect(r.verdict).toBe("OUT_OF_RANGE");
  });

  it("flags clock tampering as more severe than location", () => {
    const r = validateFieldCapture(
      {
        capture: { lat: 13.1, lng: 80.3, accuracyM: 10, deviceTime: new Date(now.getTime() - 3600_000) },
        serverTime: now,
        site,
      },
      S,
    );
    expect(r.verdict).toBe("CLOCK_TAMPER");
    expect(r.flags).toContain("OUT_OF_RANGE");
  });

  it("flags captures outside the appointment window", () => {
    const late = new Date("2026-10-22T16:00:00Z");
    const r = validateFieldCapture(
      { capture: { lat: 13.0827, lng: 80.2707, accuracyM: 10, deviceTime: late }, serverTime: late, site, appointment: appt },
      S,
    );
    expect(r.verdict).toBe("TIME_MISMATCH");
  });

  it("flags impossible travel (mock location)", () => {
    const r = validateFieldCapture(
      {
        capture: { lat: 13.0827, lng: 80.2707, accuracyM: 10 },
        serverTime: now,
        site,
        lastPing: { lat: 12.9716, lng: 77.5946, at: new Date(now.getTime() - 10 * 60_000) },
      },
      S,
    );
    expect(r.verdict).toBe("IMPOSSIBLE_TRAVEL");
  });

  it("handles missing GPS, low accuracy and unpinned sites", () => {
    expect(validateFieldCapture({ capture: null, serverTime: now, site }, S).verdict).toBe("NO_GPS");
    expect(
      validateFieldCapture({ capture: { lat: 13.0827, lng: 80.2707, accuracyM: 500 }, serverTime: now, site }, S).verdict,
    ).toBe("LOW_ACCURACY");
    expect(
      validateFieldCapture({ capture: { lat: 13.0827, lng: 80.2707, accuracyM: 5 }, serverTime: now, site: null }, S).verdict,
    ).toBe("SITE_UNPINNED");
  });
});

describe("text utils", () => {
  it("normalises Indian phone numbers", () => {
    expect(normalizePhone("98765 43210")).toBe("919876543210");
    expect(normalizePhone("+91-98765-43210")).toBe("919876543210");
    expect(normalizePhone("098765 43210")).toBe("919876543210");
    expect(normalizePhone("12345")).toBeNull();
  });
  it("renders templates", () => {
    expect(renderTemplate("Hi {{name}}, {{ kw }} kW {{missing}}!", { name: "Ravi", kw: 3.3 })).toBe("Hi Ravi, 3.3 kW !");
  });
  it("parses CSV with quotes", () => {
    expect(parseCSV('name,phone\n"Kumar, R",9876543210\r\n"Say ""hi""",9000000000\n')).toEqual([
      ["name", "phone"],
      ["Kumar, R", "9876543210"],
      ['Say "hi"', "9000000000"],
    ]);
  });
  it("formats compact INR", () => {
    expect(formatINRCompact(250000)).toBe("₹2.5 L");
    expect(formatINRCompact(32000000)).toBe("₹3.20 Cr");
  });
  it("settings parser tolerates bad keys", () => {
    const s = parseSettings({ tariffPerUnit: "bad", geofenceRadiusM: 300 });
    expect(s.tariffPerUnit).toBe(S.tariffPerUnit);
    expect(s.geofenceRadiusM).toBe(300);
  });
});

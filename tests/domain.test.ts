import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as S, parseSettings } from "@/lib/settings";
import { boqCosts, centralSubsidy, inverterPrice, pickInverterKw, sizeSystem, unitsFromBill } from "@/lib/solar/sizing";
import { tnebBillFromBiMonthlyUnits, tnebBiMonthlyUnitsFromBill, tnebMonthlyUnitsFromMonthlyBill } from "@/lib/solar/tneb-tariff";
import { emi, loanPlan } from "@/lib/solar/finance";
import { panelGrid } from "@/lib/solar/layout";
import { basicQualification, salesScore } from "@/lib/qualification";
import { haversineM, validateFieldCapture } from "@/lib/geo";
import { normalizePhone, parseCSV, renderTemplate, formatINRCompact } from "@/lib/text";
import { billingState, seatLimitReached, PLANS } from "@/lib/billing/plans";

describe("subsidy (PM Surya Ghar)", () => {
  it("pays 30k/kW for first 2 kW, 18k for 3rd, capped at 78k", () => {
    expect(centralSubsidy(1, "RESIDENTIAL", S.subsidyRates)).toBe(30000);
    expect(centralSubsidy(2, "RESIDENTIAL", S.subsidyRates)).toBe(60000);
    expect(centralSubsidy(2.5, "RESIDENTIAL", S.subsidyRates)).toBe(69000);
    expect(centralSubsidy(3, "RESIDENTIAL", S.subsidyRates)).toBe(78000);
    expect(centralSubsidy(10, "RESIDENTIAL", S.subsidyRates)).toBe(78000);
  });
  it("pays 18k/kW for housing societies and nothing for commercial", () => {
    expect(centralSubsidy(20, "HOUSING_SOCIETY", S.subsidyRates)).toBe(360000);
    expect(centralSubsidy(600, "HOUSING_SOCIETY", S.subsidyRates)).toBe(500 * 18000);
    expect(centralSubsidy(50, "COMMERCIAL", S.subsidyRates)).toBe(0);
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
    // Panel count rounds to the nearest whole panel (not always up): 3000/550 = 5.45 → 5 panels.
    const raw = 3000 / 550;
    expect(r.panelCount).toBe(raw % 1 < 0.5 ? Math.floor(raw) : Math.ceil(raw));
    expect(r.recommendedKw).toBeCloseTo(2.75, 2);
    expect(r.subsidy).toBeGreaterThan(0);
    expect(r.totalCost).toBe(r.subtotal - r.discount + r.margin + r.gstAmount);
    expect(r.netCost).toBe(r.totalCost - r.subsidy);
    expect(r.paybackYears).toBeGreaterThan(1);
    expect(r.paybackYears).toBeLessThan(8);
    expect(r.savings25Years).toBeGreaterThan(r.annualSavings * 25);
  });

  it("prefers units over bill and respects override", () => {
    const r = sizeSystem({ monthlyBill: 9999, monthlyUnits: 120, overrideKw: 5 }, S);
    expect(r.monthlyUnits).toBe(120);
    // overrideKw=5 → 9.09 raw panels → rounds to 9 (nearest), not always up to 10.
    expect(r.panelCount).toBe(9);
    expect(r.recommendedKw).toBeCloseTo(4.95, 2);
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

describe("bottom-up BoQ pricing", () => {
  it("sums panel + inverter + BOS to exactly the subtotal sizeSystem quotes", () => {
    const r = sizeSystem({ monthlyUnits: 400, segment: "RESIDENTIAL" }, S);
    const boq = boqCosts(r.recommendedKw, r.panelCount, r.panelWattage, r.inverterKw, null, S);
    expect(boq.subtotal).toBe(r.subtotal);
    expect(boq.panelCost).toBe(r.panelCost);
    expect(boq.inverterCost).toBe(r.inverterCost);
    expect(boq.bosCost).toBe(r.bosCost);
    expect(boq.panelCost + boq.inverterCost + boq.bosCost).toBe(boq.subtotal);
  });

  it("applies a company margin on top of cost before GST", () => {
    const flat = sizeSystem({ monthlyUnits: 300 }, { ...S, marginPct: 0 });
    const margined = sizeSystem({ monthlyUnits: 300 }, { ...S, marginPct: 10 });
    expect(margined.margin).toBe(Math.round(flat.subtotal * 0.1));
    expect(margined.totalCost).toBeGreaterThan(flat.totalCost);
    expect(margined.totalCost).toBe(flat.subtotal + margined.margin + margined.gstAmount);
  });

  it("reverses the blended GST rate out of a manual price override", () => {
    const r = sizeSystem({ monthlyUnits: 300, manualTotalOverride: 200000 }, S);
    expect(r.manualOverride).toBe(true);
    expect(r.totalCost).toBe(200000);
    const preTax = Math.round(200000 / (1 + S.gstRate / 100));
    expect(r.gstAmount).toBe(200000 - preTax);
    expect(r.netCost).toBe(r.totalCost - r.subsidy);
  });
});

describe("TNEB bi-monthly tariff (Tamil Nadu)", () => {
  it("round-trips known breakpoints between bill and bi-monthly units", () => {
    expect(tnebBillFromBiMonthlyUnits(400)).toBe(940); // 200 free + 200 @ ₹4.70
    expect(tnebBiMonthlyUnitsFromBill(940)).toBe(400);
    expect(tnebBillFromBiMonthlyUnits(500)).toBe(1570); // + 100 @ ₹6.30
    expect(tnebBiMonthlyUnitsFromBill(1570)).toBe(500);
  });

  it("switches to Tier B (only 100 free units) once consumption passes 500", () => {
    expect(tnebBillFromBiMonthlyUnits(500)).toBeLessThan(tnebBillFromBiMonthlyUnits(501));
    expect(tnebBillFromBiMonthlyUnits(600)).toBe(Math.round(300 * 4.7 + 100 * 6.3 + 100 * 8.4));
  });

  it("feeds into sizeSystem when tnebTariffEnabled, converting a monthly bill via the bi-monthly table", () => {
    const tn = parseSettings({ ...S, tnebTariffEnabled: true });
    const monthlyUnits = tnebMonthlyUnitsFromMonthlyBill(1500);
    const r = sizeSystem({ monthlyBill: 1500 }, tn);
    expect(r.monthlyUnits).toBe(Math.round(monthlyUnits));
  });
});

describe("inverter price catalogue", () => {
  it("looks up an exact size and rounds up to the next cataloged size", () => {
    expect(inverterPrice(5, "SINGLE", S.inverterPrices)).toBe(25000);
    expect(inverterPrice(4.5, "SINGLE", S.inverterPrices)).toBe(25000); // no 4.5 kW entry — next size up
    expect(inverterPrice(6, "THREE", S.inverterPrices)).toBe(36000);
  });
  it("extrapolates beyond the largest cataloged size from its ₹/kW rate", () => {
    expect(inverterPrice(20, "THREE", S.inverterPrices)).toBe(Math.round((62000 / 10) * 20));
  });
  it("returns 0 for an empty catalogue", () => {
    expect(inverterPrice(5, "SINGLE", { singlePhase: [], threePhase: [] })).toBe(0);
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

describe("panel layout (schematic)", () => {
  it("returns an empty grid for zero or negative panels", () => {
    expect(panelGrid(0)).toEqual({ rows: 0, cols: 0, panelCount: 0, totalCells: 0 });
    expect(panelGrid(-3).panelCount).toBe(0);
  });
  it("fits every panel inside the grid, wider than tall", () => {
    for (const n of [1, 6, 12, 23, 60]) {
      const g = panelGrid(n);
      expect(g.totalCells).toBeGreaterThanOrEqual(n);
      expect(g.totalCells - g.rows * g.cols).toBe(0);
      expect(g.cols).toBeGreaterThanOrEqual(g.rows);
    }
  });
});

describe("billing plans", () => {
  it("treats a non-expired trial as full access regardless of seats", () => {
    const org = { plan: "STARTER", billingStatus: "TRIALING", trialEndsAt: new Date(Date.now() + 86_400_000) };
    expect(seatLimitReached(org, 50)).toBe(false);
  });
  it("blocks new seats past the plan limit once the trial has ended", () => {
    const org = { plan: "STARTER", billingStatus: "TRIALING", trialEndsAt: new Date(Date.now() - 1000) };
    expect(seatLimitReached(org, PLANS.STARTER.seatLimit!)).toBe(true);
    expect(seatLimitReached(org, PLANS.STARTER.seatLimit! - 1)).toBe(false);
  });
  it("never blocks an unlimited-seat plan", () => {
    const org = { plan: "SCALE", billingStatus: "ACTIVE", trialEndsAt: null };
    expect(seatLimitReached(org, 10_000)).toBe(false);
  });
  it("reports days left in trial, falling to 0 once expired", () => {
    const active = billingState({ plan: "GROWTH", billingStatus: "TRIALING", trialEndsAt: new Date(Date.now() + 3 * 86_400_000) });
    expect(active.trialDaysLeft).toBeGreaterThanOrEqual(2);
    expect(active.trialExpired).toBe(false);
    const expired = billingState({ plan: "GROWTH", billingStatus: "TRIALING", trialEndsAt: new Date(Date.now() - 1000) });
    expect(expired.trialExpired).toBe(true);
    expect(expired.trialDaysLeft).toBe(0);
  });
});

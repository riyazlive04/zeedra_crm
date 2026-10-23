import type { OrgSettings } from "../settings";

export type SegmentKey =
  | "RESIDENTIAL"
  | "HOUSING_SOCIETY"
  | "COMMERCIAL"
  | "INDUSTRIAL"
  | "AGRICULTURE"
  | "INSTITUTIONAL";

export interface SizingInput {
  monthlyBill?: number | null;
  monthlyUnits?: number | null;
  segment?: SegmentKey;
  sanctionedLoadKw?: number | null;
  roofAreaSqft?: number | null;
  phase?: string | null;
  /** Share of consumption to offset, 0.5–1.2. Defaults to 1 (100%). */
  offset?: number;
  /** Force a specific system size (e.g. salesperson override). */
  overrideKw?: number | null;
  panelWattage?: number;
  discount?: number;
}

export interface SizingResult {
  monthlyUnits: number;
  requiredKw: number;
  recommendedKw: number; // DC capacity actually quoted (panelCount × wattage)
  panelCount: number;
  panelWattage: number;
  inverterKw: number;
  roofNeededSqft: number;
  roofLimitedKw: number | null;
  ratePerKw: number;
  subtotal: number;
  discount: number;
  gstAmount: number;
  totalCost: number;
  centralSubsidy: number;
  stateSubsidy: number;
  subsidy: number;
  netCost: number;
  annualGenerationKwh: number;
  monthlyGenerationKwh: number;
  annualSavings: number;
  monthlySavings: number;
  newMonthlyBill: number;
  paybackYears: number;
  savings25Years: number;
  co2TonnesPerYear: number;
  treesEquivalent: number;
  warnings: string[];
}

const INVERTER_SIZES = [1, 2, 3, 3.3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 33, 40, 50, 60, 75, 80, 100, 110, 125];

const round2 = (n: number) => Math.round(n * 100) / 100;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Monthly units from the bill amount when the customer only knows the rupee figure. */
export function unitsFromBill(bill: number, s: OrgSettings): number {
  return Math.max(0, (bill - s.fixedChargesMonthly) / s.tariffPerUnit);
}

/**
 * PM Surya Ghar central financial assistance.
 * Residential: ₹30,000/kW for the first 2 kW, ₹18,000 for the 3rd kW, capped at ₹78,000.
 * Housing society / RWA (common facilities, incl. EV charging): ₹18,000/kW up to 500 kW.
 */
export function centralSubsidy(kw: number, segment: SegmentKey): number {
  if (kw <= 0) return 0;
  if (segment === "RESIDENTIAL") {
    const first = Math.min(kw, 2) * 30000;
    const third = Math.min(Math.max(kw - 2, 0), 1) * 18000;
    return Math.min(Math.round(first + third), 78000);
  }
  if (segment === "HOUSING_SOCIETY") return Math.round(Math.min(kw, 500) * 18000);
  return 0;
}

export function rateForKw(kw: number, s: OrgSettings): number {
  const slabs = [...s.priceSlabs].sort((a, b) => a.upToKw - b.upToKw);
  return (slabs.find((x) => kw <= x.upToKw) ?? slabs[slabs.length - 1]).ratePerKw;
}

export function pickInverterKw(dcKw: number): number {
  // Typical DC/AC ratio up to ~1.1 — choose the smallest standard inverter ≥ 90% of DC.
  const target = dcKw * 0.9;
  return INVERTER_SIZES.find((x) => x >= target) ?? Math.ceil(target);
}

export function sizeSystem(input: SizingInput, s: OrgSettings): SizingResult {
  const warnings: string[] = [];
  const segment = input.segment ?? "RESIDENTIAL";
  const wattage = input.panelWattage ?? s.defaultPanelWattage;

  const monthlyUnits =
    input.monthlyUnits && input.monthlyUnits > 0
      ? input.monthlyUnits
      : input.monthlyBill && input.monthlyBill > 0
        ? unitsFromBill(input.monthlyBill, s)
        : 0;

  const offset = Math.min(Math.max(input.offset ?? 1, 0.3), 1.5);
  const requiredKw = (monthlyUnits * 12 * offset) / s.specificYield;

  let targetKw = input.overrideKw && input.overrideKw > 0 ? input.overrideKw : Math.max(1, roundTo(requiredKw, 0.5));

  let roofLimitedKw: number | null = null;
  if (input.roofAreaSqft && input.roofAreaSqft > 0) {
    roofLimitedKw = Math.floor((input.roofAreaSqft / s.roofSqftPerKw) * 2) / 2;
    if (roofLimitedKw < 1) {
      warnings.push(`Roof area (${input.roofAreaSqft} sq.ft) is below the ${s.roofSqftPerKw} sq.ft needed for even 1 kW.`);
    } else if (targetKw > roofLimitedKw) {
      warnings.push(`Requirement is ${targetKw} kW but the roof fits ~${roofLimitedKw} kW. Sized to roof; consider elevated or bifacial structure.`);
      targetKw = roofLimitedKw;
    }
  }

  const panelCount = Math.max(1, Math.ceil((targetKw * 1000) / wattage));
  const dcKw = round2((panelCount * wattage) / 1000);
  const inverterKw = pickInverterKw(dcKw);

  if (input.sanctionedLoadKw && dcKw > input.sanctionedLoadKw) {
    warnings.push(`System (${dcKw} kW) exceeds sanctioned load (${input.sanctionedLoadKw} kW). Apply for load enhancement with the DISCOM before net-metering.`);
  }
  if (dcKw > 5 && input.phase === "SINGLE") {
    warnings.push("Above 5 kW most DISCOMs require a three-phase connection.");
  }
  if (segment === "RESIDENTIAL" && dcKw > 10) {
    warnings.push("Residential systems above 10 kW may need additional DISCOM technical feasibility approval.");
  }

  const ratePerKw = rateForKw(dcKw, s);
  const subtotal = Math.round(dcKw * ratePerKw);
  const discount = Math.min(Math.max(input.discount ?? 0, 0), subtotal);
  const taxable = subtotal - discount;
  const gstAmount = Math.round((taxable * s.gstRate) / 100);
  const totalCost = taxable + gstAmount;

  const central = s.centralSubsidyEnabled ? centralSubsidy(dcKw, segment) : 0;
  const state =
    s.stateSubsidyPerKw > 0
      ? Math.round(Math.min(dcKw * s.stateSubsidyPerKw, s.stateSubsidyCap > 0 ? s.stateSubsidyCap : Infinity))
      : 0;
  const subsidy = Math.min(central + state, totalCost);
  const netCost = totalCost - subsidy;

  const annualGenerationKwh = Math.round(dcKw * s.specificYield);
  const annualConsumption = monthlyUnits * 12;
  const selfUsed = annualConsumption > 0 ? Math.min(annualGenerationKwh, annualConsumption) : annualGenerationKwh;
  const exported = Math.max(0, annualGenerationKwh - selfUsed);
  const annualSavings = Math.round(selfUsed * s.tariffPerUnit + exported * s.exportTariffPerUnit);

  let savings25Years = 0;
  for (let y = 0; y < 25; y++) {
    savings25Years +=
      annualSavings * Math.pow(1 - s.degradationPct / 100, y) * Math.pow(1 + s.tariffEscalationPct / 100, y);
  }

  const currentMonthlyBill = monthlyUnits * s.tariffPerUnit + s.fixedChargesMonthly;
  const newMonthlyBill = Math.max(s.fixedChargesMonthly, Math.round(currentMonthlyBill - annualSavings / 12));
  const co2 = (annualGenerationKwh * s.gridEmissionFactor) / 1000;

  return {
    monthlyUnits: Math.round(monthlyUnits),
    requiredKw: round2(requiredKw),
    recommendedKw: dcKw,
    panelCount,
    panelWattage: wattage,
    inverterKw,
    roofNeededSqft: Math.round(dcKw * s.roofSqftPerKw),
    roofLimitedKw,
    ratePerKw,
    subtotal,
    discount,
    gstAmount,
    totalCost,
    centralSubsidy: central,
    stateSubsidy: state,
    subsidy,
    netCost,
    annualGenerationKwh,
    monthlyGenerationKwh: Math.round(annualGenerationKwh / 12),
    annualSavings,
    monthlySavings: Math.round(annualSavings / 12),
    newMonthlyBill,
    paybackYears: annualSavings > 0 ? round2(netCost / annualSavings) : 0,
    savings25Years: Math.round(savings25Years),
    co2TonnesPerYear: round2(co2),
    treesEquivalent: Math.round((co2 * 1000) / 21), // ~21 kg CO2 absorbed per tree per year
    warnings,
  };
}

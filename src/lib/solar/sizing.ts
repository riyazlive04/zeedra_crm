import type { OrgSettings } from "../settings";
import { tnebMonthlyUnitsFromMonthlyBill, tnebMonthlyBillFromMonthlyUnits } from "./tneb-tariff";

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
  /**
   * Salesperson types a final negotiated price instead of accepting the computed one. The
   * pre-tax/GST split is backed out of this figure (same blended rate), and net cost is
   * recomputed off it — the itemised BoQ and margin lines are left as computed, for reference,
   * and are not force-reconciled to this number.
   */
  manualTotalOverride?: number | null;
}

export interface BoqLine {
  key: string;
  name: string;
  spec: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface BoqCosts {
  panelCost: number;
  inverterCost: number;
  bos: BoqLine[];
  bosCost: number;
  subtotal: number;
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
  panelCost: number;
  inverterCost: number;
  bosCost: number;
  subtotal: number;
  discount: number;
  margin: number;
  marginGstAmount: number;
  gstAmount: number;
  totalCost: number;
  manualOverride: boolean;
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
// Used only as a last resort, for an inverter size with no cataloged price at all.
const FALLBACK_INVERTER_RATE_PER_KW = 5000;

const round2 = (n: number) => Math.round(n * 100) / 100;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Monthly units from the bill amount when the customer only knows the rupee figure. */
export function unitsFromBill(bill: number, s: OrgSettings): number {
  if (s.tnebTariffEnabled) return tnebMonthlyUnitsFromMonthlyBill(bill);
  return Math.max(0, (bill - s.fixedChargesMonthly) / s.tariffPerUnit);
}

/** The monthly EB bill a given monthly consumption works out to, under the active tariff model. */
export function billFromUnits(monthlyUnits: number, s: OrgSettings): number {
  if (s.tnebTariffEnabled) return tnebMonthlyBillFromMonthlyUnits(monthlyUnits);
  return monthlyUnits * s.tariffPerUnit + s.fixedChargesMonthly;
}

/**
 * PM Surya Ghar central financial assistance — two claim types, rates set once by the admin
 * (Settings → Pricing & subsidy):
 *  - House (segment RESIDENTIAL): per-kW tiers, e.g. ₹30,000/kW up to 2 kW then ₹18,000 for the 3rd kW,
 *    capped at a max amount (default ₹78,000).
 *  - Community (segment HOUSING_SOCIETY — RWA common facilities incl. EV charging): a flat ₹/kW rate,
 *    capped at a max system size (default ₹18,000/kW up to 500 kW).
 */
export function centralSubsidy(kw: number, segment: SegmentKey, rates: OrgSettings["subsidyRates"]): number {
  if (kw <= 0) return 0;
  if (segment === "RESIDENTIAL") {
    const tiers = [...rates.house.tiers].sort((a, b) => a.uptoKw - b.uptoKw);
    let amount = 0;
    let floor = 0;
    for (const tier of tiers) {
      amount += Math.max(0, Math.min(kw, tier.uptoKw) - floor) * tier.ratePerKw;
      floor = tier.uptoKw;
    }
    return Math.min(Math.round(amount), rates.house.maxAmount);
  }
  if (segment === "HOUSING_SOCIETY") return Math.round(Math.min(kw, rates.community.maxKw) * rates.community.ratePerKw);
  return 0;
}

/** Slab-based ₹/kW rate — superseded by {@link boqCosts} for pricing; kept for the Settings editor. */
export function rateForKw(kw: number, s: OrgSettings): number {
  const slabs = [...s.priceSlabs].sort((a, b) => a.upToKw - b.upToKw);
  return (slabs.find((x) => kw <= x.upToKw) ?? slabs[slabs.length - 1]).ratePerKw;
}

/** State top-up subsidy — a flat amount per size tier (e.g. Tamil Nadu G.O. 102), not per-kW. */
export function stateSubsidy(kw: number, tiers: OrgSettings["stateSubsidyTiers"]): number {
  if (kw <= 0 || tiers.length === 0) return 0;
  const sorted = [...tiers].sort((a, b) => a.upToKw - b.upToKw);
  return (sorted.find((t) => kw <= t.upToKw) ?? sorted[sorted.length - 1]).amount;
}

export function pickInverterKw(dcKw: number): number {
  // Up to 120% DC overloading is standard — choose the smallest inverter where dcKw/inverterKw ≤ 1.2,
  // i.e. the inverter only needs to cover dcKw / 1.2.
  const target = dcKw / 1.2;
  return INVERTER_SIZES.find((x) => x >= target) ?? Math.ceil(target);
}

/**
 * Looks up the admin's configured inverter price (Settings → Pricing) for the chosen phase and
 * kW size: the next cataloged size up if there's no exact match, or — beyond the largest
 * cataloged size — an extrapolation from its ₹/kW rate.
 */
export function inverterPrice(kw: number, phase: string | null | undefined, catalog: OrgSettings["inverterPrices"]): number {
  const list = phase === "SINGLE" ? catalog.singlePhase : catalog.threePhase;
  if (list.length === 0) return 0;
  const sorted = [...list].sort((a, b) => a.kw - b.kw);
  const next = sorted.find((c) => c.kw >= kw);
  if (next) return next.price;
  const largest = sorted[sorted.length - 1];
  return Math.round((largest.price / largest.kw) * kw);
}

/**
 * Bottom-up Bill of Quantities: every component of the system priced independently off the
 * admin's rate card (Settings → Pricing), summed to get the subtotal — rather than picking one
 * lump ₹/kW slab price and splitting it proportionally across cosmetic line items.
 */
export function boqCosts(
  dcKw: number,
  panelCount: number,
  panelWattage: number,
  inverterKw: number,
  phase: string | null | undefined,
  s: Pick<OrgSettings, "panelRatePerWatt" | "bomRates" | "inverterPrices">,
): BoqCosts {
  const panelCost = Math.round(panelCount * panelWattage * s.panelRatePerWatt);
  const catalogued = inverterPrice(inverterKw, phase, s.inverterPrices);
  const inverterCost = catalogued > 0 ? catalogued : Math.round(inverterKw * FALLBACK_INVERTER_RATE_PER_KW);

  const bom = s.bomRates;
  const perKwLines: [string, string, string][] = [
    ["mounting", "Mounting structure", "mountingPerKw"],
    ["dcdb", "DCDB — DC distribution box", "dcdbPerKw"],
    ["acdb", "ACDB — AC distribution box", "acdbPerKw"],
    ["dcCable", "DC cable", "dcCablePerKw"],
    ["acCable", "AC copper cable", "acCablePerKw"],
    ["misc", "Miscellaneous hardware", "miscPerKw"],
    ["installation", "Installation, testing & commissioning", "installationPerKw"],
    ["transport", "Transport & logistics", "transportPerKw"],
    ["netMetering", "Net-metering, DISCOM liaison & subsidy documentation", "netMeteringPerKw"],
  ];
  const bos: BoqLine[] = perKwLines.map(([key, name, rateKey]) => {
    const rate = bom[rateKey as keyof typeof bom];
    return { key, name, spec: `${dcKw} kWp`, qty: 1, unit: "Lot", rate: Math.round(rate), amount: Math.round(rate * dcKw) };
  });
  bos.push({ key: "earthing", name: "Earthing kit & lightning arrester", spec: "Per MNRE guidelines", qty: 1, unit: "Set", rate: Math.round(bom.earthingKitEach + bom.lightningArrestorEach), amount: Math.round(bom.earthingKitEach + bom.lightningArrestorEach) });

  const bosCost = bos.reduce((sum, l) => sum + l.amount, 0);
  return { panelCost, inverterCost, bos, bosCost, subtotal: panelCost + inverterCost + bosCost };
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

  // Round to the nearest whole panel (not always up) — matches a real BoQ panel count.
  const rawPanels = (targetKw * 1000) / wattage;
  const panelCount = Math.max(1, rawPanels % 1 < 0.5 ? Math.floor(rawPanels) : Math.ceil(rawPanels));
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

  const boq = boqCosts(dcKw, panelCount, wattage, inverterKw, input.phase, s);
  const subtotal = boq.subtotal;
  const discount = Math.min(Math.max(input.discount ?? 0, 0), subtotal);
  const taxable = subtotal - discount;
  const margin = Math.round((taxable * (s.marginPct ?? 0)) / 100);
  const subtotalGst = Math.round((taxable * s.gstRate) / 100);
  const marginGstAmount = Math.round((margin * s.gstRate) / 100);
  let gstAmount = subtotalGst + marginGstAmount;
  let totalCost = taxable + margin + gstAmount;

  const manualOverride = Boolean(input.manualTotalOverride && input.manualTotalOverride > 0);
  if (manualOverride && input.manualTotalOverride) {
    // Reverse the blended GST rate out of the typed-in final price, keeping the books balanced.
    const preTax = Math.round(input.manualTotalOverride / (1 + s.gstRate / 100));
    gstAmount = input.manualTotalOverride - preTax;
    totalCost = input.manualTotalOverride;
  }

  const central = s.centralSubsidyEnabled ? centralSubsidy(dcKw, segment, s.subsidyRates) : 0;
  const state = stateSubsidy(dcKw, s.stateSubsidyTiers);
  const subsidy = Math.min(central + state, totalCost);
  const netCost = totalCost - subsidy;

  const annualGenerationKwh = Math.round(dcKw * s.specificYield);
  const monthlyGenerationKwh = annualGenerationKwh / 12;
  const selfUsedMonthly = monthlyUnits > 0 ? Math.min(monthlyGenerationKwh, monthlyUnits) : monthlyGenerationKwh;
  const exportedMonthly = Math.max(0, monthlyGenerationKwh - selfUsedMonthly);

  // Self-consumed units are valued by what they actually save on the bill (telescopic tariffs
  // displace the most expensive units first automatically when you reduce total consumption);
  // exported/net-metered units are credited at the separate export tariff.
  const billBefore = billFromUnits(monthlyUnits, s);
  const billAfterSelfUse = billFromUnits(Math.max(0, monthlyUnits - selfUsedMonthly), s);
  const monthlySavingsFromSelfUse = Math.max(0, billBefore - billAfterSelfUse);
  const monthlySavingsFromExport = exportedMonthly * s.exportTariffPerUnit;
  const annualSavings = Math.round((monthlySavingsFromSelfUse + monthlySavingsFromExport) * 12);

  let savings25Years = 0;
  for (let y = 0; y < 25; y++) {
    savings25Years +=
      annualSavings * Math.pow(1 - s.degradationPct / 100, y) * Math.pow(1 + s.tariffEscalationPct / 100, y);
  }

  const newMonthlyBill = Math.round(billAfterSelfUse);
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
    ratePerKw: dcKw > 0 ? Math.round(subtotal / dcKw) : 0,
    panelCost: boq.panelCost,
    inverterCost: boq.inverterCost,
    bosCost: boq.bosCost,
    subtotal,
    discount,
    margin,
    marginGstAmount,
    gstAmount,
    totalCost,
    manualOverride,
    centralSubsidy: central,
    stateSubsidy: state,
    subsidy,
    netCost,
    annualGenerationKwh,
    monthlyGenerationKwh: Math.round(monthlyGenerationKwh),
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

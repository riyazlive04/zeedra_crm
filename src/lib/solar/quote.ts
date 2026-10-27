import { boqCosts, type SizingResult } from "./sizing";
import type { OrgSettings } from "../settings";

export interface LineItem {
  name: string;
  spec: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
}

/**
 * The customer-facing, itemised bill of materials — each line priced independently off the
 * admin's rate card (same {@link boqCosts} used to compute the quoted subtotal), so this always
 * sums to `sz.subtotal` exactly rather than being a cosmetic proportional split of it.
 */
export function buildLineItems(
  sz: SizingResult,
  input: { panelBrand: string; panelWattage: number; inverterBrand: string; structureType?: string; phase?: string | null },
  s: Pick<OrgSettings, "panelRatePerWatt" | "bomRates" | "inverterPrices">,
): LineItem[] {
  const boq = boqCosts(sz.recommendedKw, sz.panelCount, input.panelWattage, sz.inverterKw, input.phase, s);
  return [
    { name: `${input.panelBrand} Mono PERC bifacial DCR modules`, spec: `${sz.panelCount} × ${input.panelWattage} Wp`, qty: sz.panelCount, unit: "Nos", rate: Math.round(boq.panelCost / sz.panelCount), amount: boq.panelCost },
    { name: `${input.inverterBrand} on-grid inverter`, spec: `${sz.inverterKw} kW`, qty: 1, unit: "Nos", rate: boq.inverterCost, amount: boq.inverterCost },
    ...boq.bos.map((l) => (l.key === "mounting" ? { ...l, name: input.structureType || l.name } : l)),
  ];
}

export const DEFAULT_TERMS = [
  "Prices include GST as shown. Subsidy under PM Surya Ghar is credited by the Government directly to the customer's bank account after commissioning and DISCOM inspection.",
  "Payment: 30% advance on booking, 60% on material delivery, 10% on commissioning (or as per loan disbursement schedule).",
  "Warranty: Modules — 12 years product, 25-30 years linear performance. Inverter — 8-10 years. Workmanship — 5 years.",
  "Net-metering approval timelines depend on the DISCOM. Installation typically within 7–15 days of approval.",
  "Free first-year AMC with quarterly cleaning visits. Generation estimates are indicative and depend on weather and shading.",
].join("\n");

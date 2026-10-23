import type { SizingResult } from "./sizing";

export interface LineItem {
  name: string;
  spec: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
}

/** Splits the system price into a customer-friendly bill of materials. */
export function buildLineItems(sz: SizingResult, input: { panelBrand: string; panelWattage: number; inverterBrand: string; structureType?: string }): LineItem[] {
  const split: [string, string, number, string, number][] = [
    [`${input.panelBrand} Mono PERC bifacial DCR modules`, `${sz.panelCount} × ${input.panelWattage} Wp`, sz.panelCount, "Nos", 0.52],
    [`${input.inverterBrand} on-grid inverter`, `${sz.inverterKw} kW`, 1, "Nos", 0.15],
    [input.structureType || "Hot-dip galvanised elevated mounting structure", `${sz.recommendedKw} kWp`, 1, "Set", 0.12],
    ["Balance of system — DC/AC cables, ACDB/DCDB, earthing, lightning arrester", "As per design", 1, "Lot", 0.11],
    ["Installation, testing & commissioning", "Turnkey", 1, "Job", 0.07],
    ["Net-metering, DISCOM liaison & subsidy documentation", "PM Surya Ghar", 1, "Job", 0.03],
  ];
  let allocated = 0;
  return split.map(([name, spec, qty, unit, pct], i) => {
    const amount = i === split.length - 1 ? sz.subtotal - allocated : Math.round(sz.subtotal * pct);
    allocated += amount;
    return { name, spec, qty, unit, rate: Math.round(amount / qty), amount };
  });
}


export const DEFAULT_TERMS = [
  "Prices include GST as shown. Subsidy under PM Surya Ghar is credited by the Government directly to the customer's bank account after commissioning and DISCOM inspection.",
  "Payment: 30% advance on booking, 60% on material delivery, 10% on commissioning (or as per loan disbursement schedule).",
  "Warranty: Modules — 12 years product, 25-30 years linear performance. Inverter — 8-10 years. Workmanship — 5 years.",
  "Net-metering approval timelines depend on the DISCOM. Installation typically within 7–15 days of approval.",
  "Free first-year AMC with quarterly cleaning visits. Generation estimates are indicative and depend on weather and shading.",
].join("\n");

import { inverterPrice, type SizingResult } from "./sizing";
import type { OrgSettings } from "../settings";

export interface LineItem {
  name: string;
  spec: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
}

const PANEL_SHARE = 0.52;
// Used only if the admin hasn't catalogued any inverter prices yet.
const INVERTER_SHARE = 0.15;

/** Splits the system price into a customer-friendly, itemised bill of materials. */
export function buildLineItems(
  sz: SizingResult,
  input: { panelBrand: string; panelWattage: number; inverterBrand: string; structureType?: string; phase?: string | null },
  s: Pick<OrgSettings, "bomRates" | "inverterPrices">,
): LineItem[] {
  const kw = sz.recommendedKw;
  const bom = s.bomRates;
  const panelAmount = Math.round(sz.subtotal * PANEL_SHARE);
  const catalogued = inverterPrice(sz.inverterKw, input.phase, s.inverterPrices);
  const inverterAmount = catalogued > 0 ? catalogued : Math.round(sz.subtotal * INVERTER_SHARE);

  // Everything below is priced off configurable ₹/kW build rates, then scaled to fit
  // whatever is left of the system price after panels + inverter — so the BOM always
  // adds up to the quoted total, however large or small the system is.
  const bos: [string, string, number, string, number][] = [
    [input.structureType || "Hot-dip galvanised elevated mounting structure", `${kw} kWp`, 1, "Set", bom.mountingPerKw * kw],
    ["DCDB — DC distribution box", `${kw} kWp`, 1, "Set", bom.dcdbPerKw * kw],
    ["ACDB — AC distribution box", `${kw} kWp`, 1, "Set", bom.acdbPerKw * kw],
    ["DC cable", `${kw} kWp`, 1, "Lot", bom.dcCablePerKw * kw],
    ["AC copper cable", `${kw} kWp`, 1, "Lot", bom.acCablePerKw * kw],
    ["Earthing kit & lightning arrester", "Per MNRE guidelines", 1, "Set", bom.earthingKitEach + bom.lightningArrestorEach],
    ["Miscellaneous hardware", `${kw} kWp`, 1, "Lot", bom.miscPerKw * kw],
    ["Installation, testing & commissioning", "Turnkey", 1, "Job", bom.installationPerKw * kw],
    ["Transport & logistics", `${kw} kWp`, 1, "Lot", bom.transportPerKw * kw],
    ["Net-metering, DISCOM liaison & subsidy documentation", "PM Surya Ghar", 1, "Job", bom.netMeteringPerKw * kw],
  ];
  const bosPool = sz.subtotal - panelAmount - inverterAmount;
  const bosRaw = bos.reduce((sum, [, , , , amount]) => sum + amount, 0);
  const scale = bosRaw > 0 ? bosPool / bosRaw : 0;

  let allocated = 0;
  const bosLines = bos.map(([name, spec, qty, unit, raw], i) => {
    const amount = i === bos.length - 1 ? bosPool - allocated : Math.round(raw * scale);
    allocated += amount;
    return { name, spec, qty, unit, rate: Math.round(amount / qty), amount };
  });

  return [
    { name: `${input.panelBrand} Mono PERC bifacial DCR modules`, spec: `${sz.panelCount} × ${input.panelWattage} Wp`, qty: sz.panelCount, unit: "Nos", rate: Math.round(panelAmount / sz.panelCount), amount: panelAmount },
    { name: `${input.inverterBrand} on-grid inverter`, spec: `${sz.inverterKw} kW`, qty: 1, unit: "Nos", rate: inverterAmount, amount: inverterAmount },
    ...bosLines,
  ];
}


export const DEFAULT_TERMS = [
  "Prices include GST as shown. Subsidy under PM Surya Ghar is credited by the Government directly to the customer's bank account after commissioning and DISCOM inspection.",
  "Payment: 30% advance on booking, 60% on material delivery, 10% on commissioning (or as per loan disbursement schedule).",
  "Warranty: Modules — 12 years product, 25-30 years linear performance. Inverter — 8-10 years. Workmanship — 5 years.",
  "Net-metering approval timelines depend on the DISCOM. Installation typically within 7–15 days of approval.",
  "Free first-year AMC with quarterly cleaning visits. Generation estimates are indicative and depend on weather and shading.",
].join("\n");

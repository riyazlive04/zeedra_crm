/**
 * Quotify quotation engine — a faithful port of the production Quotify app (quote.zeedra.in):
 * sizing from the TNEB bi-monthly bill, inverter pick, per-system-type Bill of Quantities,
 * margin + blended 8.9% GST, manual price override, PM Surya Ghar + TN state subsidy, and the
 * 30-year savings / breakeven model. Pure functions, safe on both client and server.
 *
 * Keep formulas byte-for-byte equivalent to Quotify: the same inputs must give the same rupees.
 */

import type { OrgSettings } from "../settings";

export type SysType = "dcr" | "ndcr" | "hybrid" | "micro";
export type PanelTech = "bifacial" | "topcon" | "hjt";
export type Structure = "lowrise" | "highrise";
export type Phase = "single" | "three";

/** Blended solar GST: 70% goods @5% + 30% services @18%. Quotify applies it to every line. */
export const QUOTIFY_GST = 0.089;

export const QUOTIFY_DEFAULTS = {
  margin: 10, peak_sun: 4.5, efficiency: 80,
  dcr_panel_w: 550,
  dcr_pw_545: 27.5, dcr_pw_550: 27.5, dcr_pw_555: 27.5, dcr_pw_560: 27.5,
  dcr_pw_565: 27.5, dcr_pw_570: 27.5, dcr_pw_575: 27.5, dcr_pw_580: 27.5,
  dcr_pw_585: 27.5, dcr_pw_590: 27.5, dcr_pw_595: 27.5, dcr_pw_600: 27.5,
  dcr_pw_605: 27.5, dcr_pw_610: 27.5,
  dcr_struct: 5000, dcr_dcdb: 2000, dcr_acdb: 2000,
  dcr_dccable: 2000, dcr_accable: 2000, dcr_misc: 2000,
  install: 3000, transport: 1000,
  ndcr_panel_w: 580,
  ndcr_pw_585: 18, ndcr_pw_590: 18, ndcr_pw_595: 18, ndcr_pw_600: 18,
  ndcr_pw_605: 18, ndcr_pw_610: 18, ndcr_pw_615: 18, ndcr_pw_620: 18,
  ndcr_pw_625: 18, ndcr_pw_630: 18, ndcr_pw_635: 18, ndcr_pw_640: 18,
  ndcr_pw_645: 18, ndcr_pw_650: 18, ndcr_pw_655: 18, ndcr_pw_660: 18,
  ndcr_pw_665: 18, ndcr_pw_670: 18, ndcr_pw_675: 18, ndcr_pw_680: 18,
  ndcr_pw_685: 18, ndcr_pw_690: 18, ndcr_pw_695: 18, ndcr_pw_700: 18,
  topcon_panel_w: 600, hjt_panel_w: 600,
  inv_3k: 14000, inv_4k: 17500, inv_5k: 21000,
  inv3ph_4k: 22000, inv3ph_5k: 26000, inv3ph_6k: 34000, inv3ph_8k: 46000, inv3ph_10k: 62000,
  hinv_3k: 66000, hinv_5k: 80000, hinv_10k: 110000,
  battery: 92000, hyb_changeover: 4350, hyb_batt_switch: 2300, hyb_batt_rack: 4500,
  hyb_epwr: 3000, hyb_batt_cable: 2000, hyb_dc_cable: 2000, hyb_misc: 500,
  hyb_install: 4000, hyb_transport: 1500,
  lightning: 1000, earth_kit: 1000, earth_cable: 160, floor_cable: 8, micro_inv: 8500,
  brand_dcr_panel: "Adani",
  brand_ndcr_panel: "REC",
  brand_ongrid_inv: "Growatt",
  brand_hybrid_inv: "Deye",
  brand_micro_inv: "Enphase",
  brand_structure: "VRM/GreenField",
  brand_dcdb_acdb: "Nordic/GreenField",
  brand_dc_cable: "Polycab/Orbit",
  brand_ac_cable: "Polycab/Orbit",
  brand_earth_cable: "Polycab",
  brand_conduit: "Finolex",
  brand_battery: "Deye/Dyness",
  brand_mcb: "Schneider",
  brand_lightning: "Branded",
  brand_transport: "MSS",
} as const;

export type QuotifyPriceKey = keyof typeof QUOTIFY_DEFAULTS;
/** Resolved price sheet: every default key, plus `dcr_pw_<W>` / `ndcr_pw_<W>` for custom wattages. */
export type QuotifyPrices = { -readonly [K in QuotifyPriceKey]: (typeof QUOTIFY_DEFAULTS)[K] extends string ? string : number } & Record<string, number | string>;

export interface QuotifyCustomRows {
  inv_1ph: { kw: number; price: number }[];
  inv_3ph: { kw: number; price: number }[];
  inv_hyb: { kw: number; price: number }[];
  panel_dcr: { w: number; perW: number }[];
  panel_ndcr: { w: number; perW: number }[];
  components: { name: string; price: number; perKw: boolean }[];
}

export const EMPTY_CUSTOM: QuotifyCustomRows = { inv_1ph: [], inv_3ph: [], inv_hyb: [], panel_dcr: [], panel_ndcr: [], components: [] };

export const WATTAGE_OPTIONS: Record<PanelTech, number[]> = {
  bifacial: [545, 550, 555, 560],
  topcon: [580, 585, 590, 595, 600, 605, 610, 615, 620, 625, 630, 635, 640],
  hjt: [690, 700, 710, 720, 730, 740, 750],
};

export const DCR_PRICE_WATTS = [545, 550, 555, 560, 565, 570, 575, 580, 585, 590, 595, 600, 605, 610];
export const NDCR_PRICE_WATTS = [585, 590, 595, 600, 605, 610, 615, 620, 625, 630, 635, 640, 645, 650, 655, 660, 665, 670, 675, 680, 685, 690, 695, 700];

export const PANEL_BRANDS = {
  dcr: ["Adani", "Premier Energies", "Waaree", "Goldi", "Tata", "Vikram", "Renewsys", "Panasonic", "Renew", "Pahal", "Gautam", "Swelect", "Saatvik", "Luminous", "UTL"],
  ndcr: ["REC", "Jinko", "Canadian Solar", "LONGi", "JA Solar", "Adani", "Premier Energies", "Waaree", "Goldi", "Tata", "Vikram", "Renewsys", "Panasonic", "Renew", "Pahal", "Gautam", "Swelect", "Saatvik", "Luminous", "UTL", "Kirloskar", "LOOM"],
};

export const INVERTER_BRANDS = {
  ongrid: ["Growatt", "Deye/Polycab", "Sungrow", "Deye", "SolarEdge", "Havells", "Polycab", "Waaree", "UTL Solar", "Solis", "Goodwe", "SMA", "Fronius", "Delta", "Solplanet", "Luminous"],
  hybrid: ["Deye", "Deye/Polycab", "Polycab", "Sungrow", "SolarEdge", "Growatt", "Goodwe", "Solis", "Sofar", "Solax", "Luminous"],
  micro: ["Enphase", "APsystems", "Hoymiles"],
};

export const SYS_LABEL: Record<SysType, string> = { dcr: "On-Grid DCR", ndcr: "On-Grid NDCR", hybrid: "Hybrid (with Battery)", micro: "Micro Inverter" };
export const PANEL_TECH_LABEL: Record<PanelTech, string> = { bifacial: "Bifacial", topcon: "TOPCon", hjt: "HJT" };

/** Merge a saved (partial) price sheet over the defaults, and fold in custom panel wattage rates. */
export function resolvePrices(saved: Record<string, unknown> | undefined, custom: QuotifyCustomRows): QuotifyPrices {
  const P: Record<string, number | string> = {};
  const s = saved ?? {};
  for (const key of Object.keys(QUOTIFY_DEFAULTS) as QuotifyPriceKey[]) {
    const def = QUOTIFY_DEFAULTS[key];
    const v = s[key];
    if (typeof def === "string") P[key] = typeof v === "string" && v.trim() ? v : def;
    else P[key] = v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : def;
  }
  custom.panel_dcr.forEach((r) => { if (r.w > 0 && r.perW > 0) P["dcr_pw_" + r.w] = r.perW; });
  custom.panel_ndcr.forEach((r) => { if (r.w > 0 && r.perW > 0) P["ndcr_pw_" + r.w] = r.perW; });
  return P as QuotifyPrices;
}

/** Standard + user-added wattages for a panel technology (DCR customs → bifacial; NDCR customs → TOPCon & HJT). */
export function wattOptions(type: PanelTech, custom: QuotifyCustomRows): number[] {
  const base = WATTAGE_OPTIONS[type].slice();
  const extra = type === "bifacial" ? custom.panel_dcr : custom.panel_ndcr;
  extra.forEach((r) => { if (r.w > 0 && !base.includes(r.w)) base.push(r.w); });
  return base.sort((a, b) => a - b);
}

/** The settings default wattage for a technology, snapped to the closest offered option. */
export function defaultWattFor(type: PanelTech, P: QuotifyPrices, custom: QuotifyCustomRows, sysType?: SysType): number {
  const opts = sysType === "ndcr" && type === "topcon" ? WATTAGE_OPTIONS.topcon : wattOptions(type, custom);
  const defW = sysType === "ndcr" ? P.ndcr_panel_w : type === "hjt" ? P.hjt_panel_w : type === "topcon" ? P.topcon_panel_w : P.dcr_panel_w;
  return opts.reduce((b, o) => (Math.abs(o - defW) < Math.abs(b - defW) ? o : b), opts[0]);
}

export type InvKind = "inv_1ph" | "inv_3ph" | "inv_hyb";

/** Standard sizes + user-added sizes for one inverter family, sorted by kW. */
export function invSizeList(kind: InvKind, P: QuotifyPrices, custom: QuotifyCustomRows): { kw: number; cost: number }[] {
  const base =
    kind === "inv_3ph"
      ? [{ kw: 4, cost: P.inv3ph_4k }, { kw: 5, cost: P.inv3ph_5k }, { kw: 6, cost: P.inv3ph_6k }, { kw: 8, cost: P.inv3ph_8k }, { kw: 10, cost: P.inv3ph_10k }]
      : kind === "inv_hyb"
        ? [{ kw: 3, cost: P.hinv_3k }, { kw: 5, cost: P.hinv_5k }, { kw: 10, cost: P.hinv_10k }]
        : [{ kw: 3, cost: P.inv_3k }, { kw: 4, cost: P.inv_4k }, { kw: 5, cost: P.inv_5k }];
  custom[kind].forEach((r) => { if (r.kw > 0 && r.price > 0 && !base.some((b) => b.kw === r.kw)) base.push({ kw: r.kw, cost: r.price }); });
  return base.sort((a, b) => a.kw - b.kw);
}

// ─── TANGEDCO telescopic tariff (TNERC Order No. 6 of 2024) ───────────────────

export function calcTNEBBimonthlyBill(u: number): number {
  let bill = 0;
  if (u <= 500) {
    if (u > 200) bill += Math.min(u - 200, 200) * 4.7;
    if (u > 400) bill += (u - 400) * 6.3;
  } else {
    bill += Math.min(u - 100, 300) * 4.7;
    if (u > 400) bill += Math.min(u - 400, 100) * 6.3;
    if (u > 500) bill += Math.min(u - 500, 100) * 8.4;
    if (u > 600) bill += Math.min(u - 600, 200) * 9.45;
    if (u > 800) bill += Math.min(u - 800, 200) * 10.5;
    if (u > 1000) bill += (u - 1000) * 11.55;
  }
  return bill;
}

export function reverseCalcTNEBBimonthlyUnits(bill: number): number {
  if (bill <= 0) return 200;
  const lo400 = 200 * 4.7;
  const lo500 = lo400 + 100 * 6.3;
  if (bill <= lo400) return 200 + bill / 4.7;
  if (bill <= lo500) return 400 + (bill - lo400) / 6.3;
  const hi500 = 300 * 4.7 + 100 * 6.3;
  const hi600 = hi500 + 100 * 8.4;
  const hi800 = hi600 + 200 * 9.45;
  const hi1000 = hi800 + 200 * 10.5;
  if (bill <= hi600) return Math.max(500, 500 + (bill - hi500) / 8.4);
  if (bill <= hi800) return 600 + (bill - hi600) / 9.45;
  if (bill <= hi1000) return 800 + (bill - hi800) / 10.5;
  return 1000 + (bill - hi1000) / 11.55;
}

// ─── Subsidy ───────────────────────────────────────────────────────────────

/** Central PM Surya Ghar: ₹30,000/kW up to 2 kW, ₹18,000 for the 3rd kW, max ₹78,000 at 3 kW+. */
export function calcCentralSubsidy(kw: number): number {
  kw = Math.round(kw * 100) / 100;
  if (kw <= 0) return 0;
  if (kw <= 2) return Math.round(kw * 30000);
  if (kw < 3) return Math.round(60000 + (kw - 2) * 18000);
  return 78000;
}

/** Tamil Nadu G.O. (Ms) No. 102: ₹5,000 (1 kW), ₹10,000 (2 kW), ₹22,000 (3 kW and above). */
export function calcStateSubsidy(kw: number, enabled: boolean): number {
  if (!enabled) return 0;
  kw = Math.round(kw * 100) / 100;
  if (kw >= 3) return 22000;
  if (kw >= 2) return 10000;
  if (kw >= 1) return 5000;
  return 0;
}

// ─── Savings / ROI ───────────────────────────────────────────────────────────

export interface QuotifySavings {
  monthlySave: number;
  bimonthlySave: number;
  annualSave: number;
  paybackYrs: number;
  netBenefit30: number;
  annualUnits: number;
}

export function calcSavings(kw: number, totalCost: number, P: QuotifyPrices): QuotifySavings {
  const solarMonthly = kw * P.peak_sun * (P.efficiency / 100) * 30;
  const annualSave = (calcTNEBBimonthlyBill(solarMonthly * 2 + 100) / 2) * 12;
  const monthlySave = annualSave / 12;
  const bimonthlySave = monthlySave * 2;
  const paybackYrs = totalCost / annualSave;
  let cumulative = 0;
  let yearSave = annualSave;
  for (let i = 0; i < 30; i++) {
    cumulative += yearSave;
    yearSave *= 1.06;
  }
  const netBenefit30 = cumulative - totalCost;
  const annualUnits = kw * P.peak_sun * (P.efficiency / 100) * 365;
  return { monthlySave, bimonthlySave, annualSave, paybackYrs, netBenefit30, annualUnits };
}

/** Breakeven chart series: Year 0 = −investment, then cumulative savings (6%/yr escalation) − investment. */
export function netPositionSeries(annualSave: number, totalCost: number): number[] {
  let cumulative = 0;
  let ys = annualSave;
  const netPos = [-totalCost];
  for (let i = 0; i < 30; i++) {
    cumulative += ys;
    netPos.push(Math.round(cumulative - totalCost));
    ys *= 1.06;
  }
  return netPos;
}

// ─── Quotation ────────────────────────────────────────────────────────────────

export interface QuotifyInput {
  sizeMode: "eb" | "direct";
  /** Bi-monthly units as printed on the TNEB bill. */
  bimonthlyUnits?: number | null;
  /** Bi-monthly bill amount (₹) — used only when units are not given. */
  bimonthlyBill?: number | null;
  directKw?: number | null;
  structure: Structure;
  floors?: number | null;
  dcCableSize: string;
  acCableSize: string;
  systemType: SysType;
  panelType: PanelTech;
  /** Chosen panel wattage; 0/absent falls back to the settings default. */
  panelWatt?: number | null;
  /** Brand picked on the form; overrides the settings default brand for this quote. */
  panelBrand?: string | null;
  inverterBrand?: string | null;
  inverterPhase: Phase;
  /** 0/absent = auto (DC:AC ≤ 1.2). */
  inverterKw?: number | null;
  /** Salesperson-adjusted final price (incl. GST). */
  overrideTotal?: number | null;
}

export interface QuotifyRow {
  content: string;
  desc: string;
  make: string;
  qty: number;
  uom: string;
  unit: number;
  incl?: boolean;
  sub: number;
  gstAmt: number;
  total: number;
}

export interface QuotifyResult {
  monthlyGridUnits: number;
  solarKw: number;
  panelWatt: number;
  panels: number;
  actualKw: number;
  inverterKw: number;
  inverterLabel: string;
  rows: QuotifyRow[];
  /** Σ line amounts, before margin and GST. */
  itemsSubTotal: number;
  margin: number;
  /** "Sub Total (Before GST)" as printed: items + margin, or the backed-out pre-tax price when overridden. */
  preTax: number;
  gst: number;
  blendPct: number;
  /** Computed total before any override. */
  calcTotal: number;
  grandTotal: number;
  overridden: boolean;
  centralSubsidy: number;
  stateSubsidy: number;
  subsidy: number;
  netCost: number;
  savings: QuotifySavings;
  sysLabel: string;
  structLabel: string;
  title: string;
  brands: { panel: string; inverter: string };
}

export class QuotifyInputError extends Error {}

export interface QuotifyOptions {
  stateSubsidy: boolean;
  /** Printed as the "Make" of the Installation line. */
  companyName: string;
}

function inverterSpec(kw: number, input: QuotifyInput, P: QuotifyPrices, custom: QuotifyCustomRows) {
  const ph = input.inverterPhase === "three" ? "3Ph" : "1Ph";
  if (input.systemType === "micro") return { size: "", effKw: 0, cost: P.micro_inv, ph };
  const kind: InvKind = input.systemType === "hybrid" ? "inv_hyb" : input.inverterPhase === "three" ? "inv_3ph" : "inv_1ph";
  const list = invSizeList(kind, P, custom);
  // DC:AC ratio ≤ 1.2 — the smallest inverter whose AC rating covers the array at 120% overloading.
  const auto = list.find((s) => kw / s.kw <= 1.2) ?? list[list.length - 1];
  const effKw = input.inverterKw && input.inverterKw > 0 ? input.inverterKw : auto.kw;
  // Custom decimal sizes (e.g. 3.3) print as typed but price at the nearest catalogued bracket; ties round up.
  const pk = list.reduce((b, s) => (Math.abs(s.kw - effKw) <= Math.abs(b.kw - effKw) ? s : b));
  return { size: `${+effKw}kW`, effKw, cost: pk.cost, ph };
}

type Item = Omit<QuotifyRow, "sub" | "gstAmt" | "total">;

function buildItems(actualKw: number, panels: number, pw: number, input: QuotifyInput, P: QuotifyPrices, custom: QuotifyCustomRows, compName: string) {
  const isHighRise = input.structure === "highrise";
  const floors = input.floors && input.floors > 0 ? Math.floor(input.floors) : 1;
  const earthCableLen = isHighRise ? 30 + floors * P.floor_cable : 30;
  const inv = inverterSpec(actualKw, input, P, custom);
  const dc = input.dcCableSize;
  const ac = input.acCableSize;
  const t = input.panelType;
  const structUnit = Math.round((P.dcr_struct * actualKw) / panels);
  const structDesc = isHighRise ? "Elevated GI HDP" : "Ground Mount GI";
  const panelContent: Record<PanelTech, string> = { bifacial: "Module Bifacial DCR", topcon: "Module TOPCon DCR", hjt: "Module HJT DCR" };
  const panelDesc: Record<PanelTech, string> = { bifacial: `Bifacial ${pw}W`, topcon: `TOPCon ${pw}W`, hjt: `HJT ${pw}W` };
  const panelMake: Record<PanelTech, string> = { bifacial: P.brand_dcr_panel, topcon: P.brand_ndcr_panel, hjt: P.brand_ndcr_panel };
  const num = (k: string, fallback: number) => {
    const v = P[k];
    return typeof v === "number" && v ? v : fallback;
  };
  const items: Item[] = [];
  const push = (content: string, desc: string, make: string, qty: number, uom: string, unit: number, incl?: boolean) =>
    items.push({ content, desc, make, qty, uom, unit, ...(incl ? { incl } : {}) });

  if (input.systemType === "dcr" || input.systemType === "ndcr") {
    const isDcr = input.systemType === "dcr";
    const panelUnit = Math.round(num((isDcr ? "dcr_pw_" : "ndcr_pw_") + pw, isDcr ? 27.5 : 18) * pw);
    const content = isDcr ? panelContent[t] : t === "hjt" ? "Module HJT (Non-DCR)" : t === "topcon" ? "Module TOPCon (Non-DCR)" : "Module Bifacial (Non-DCR)";
    push(content, panelDesc[t], panelMake[t], panels, "Nos", panelUnit);
    push("On-Grid Inverter", `${inv.size} ${inv.ph}`, P.brand_ongrid_inv, 1, "No", inv.cost);
    push("Module Mounting Structure", structDesc, P.brand_structure, panels, "Nos", structUnit);
    push("DCDB", "1 in 1 out", P.brand_dcdb_acdb, 1, "No", P.dcr_dcdb);
    push("ACDB", "1 in 1 out", P.brand_dcdb_acdb, 1, "No", P.dcr_acdb);
    push("DC Cable", `${dc} sq.mm`, P.brand_dc_cable, 1, "As Req", P.dcr_dccable);
    push("Copper Cable, PVC Insulated", `3C, ${ac} sq.mm`, P.brand_ac_cable, 1, "As Req", P.dcr_accable);
    push("Flexible Conduits", "PVC", P.brand_conduit, 1, "As Req", 0, true);
    push("Earth Pit", "Earth pit & Chambers", "Customized", 3, "Nos", P.earth_kit);
    push("Earth Cable", `${earthCableLen}m`, P.brand_earth_cable, earthCableLen, "Mts", P.earth_cable);
    push("Lightning Arrestor", "Spike", P.brand_lightning, 1, "No", P.lightning);
    push("Miscellaneous Items", "plugs, screws, MC4 connectors", "Multiple", 1, "Set", P.dcr_misc);
    push("Transport", "Roadways", P.brand_transport, actualKw, "Lot", P.transport);
    push("Installation", "End to End", compName, actualKw, "KW", P.install);
  } else if (input.systemType === "hybrid") {
    const content = t === "hjt" ? "Module HJT" : t === "topcon" ? "Module TOPCon" : "Module Bifacial";
    const panelUnit = Math.round(num("ndcr_pw_" + pw, 18) * pw);
    push(content, panelDesc[t], panelMake[t], panels, "Nos", panelUnit);
    push("Hybrid Inverter", `${inv.size} ${inv.ph}`, P.brand_hybrid_inv, 1, "No", inv.cost);
    push("Battery (Lithium)", "G5.3 5kWh LiFePO4", P.brand_battery, 1, "No", P.battery);
    push("Mounting Structure GI", isHighRise ? "Elevated GI" : "Ground GI", P.brand_structure, panels, "Nos", structUnit);
    push("Changeover & Input MCB", "63A 4P MCB", P.brand_mcb, 1, "No", P.hyb_changeover);
    push("Battery Disconnect Switch", "125A DC Switch", "Branded", 1, "No", P.hyb_batt_switch);
    push("Battery Rack", "GI Powder Coated", "Customized", 1, "No", P.hyb_batt_rack);
    push("EPWR Cable / ECOM", "Communication Cable", "Branded", 1, "Set", P.hyb_epwr);
    push("Battery Cable Copper", "25sq.mm", P.brand_earth_cable, 1, "Set", P.hyb_batt_cable);
    push("DC Cable", `Solar DC Cable, ${dc} sq.mm`, P.brand_dc_cable, 1, "As Req", P.hyb_dc_cable);
    push("Earth Pit", "Earth pit & Chambers", "Customized", 3, "Nos", P.earth_kit);
    push("Lightning Arrestor", "Spike", P.brand_lightning, 1, "No", P.lightning);
    push("Miscellaneous Items", "plugs, screws, connectors", "Multiple", actualKw, "Set", P.hyb_misc);
    push("Installation", "End to End", compName, actualKw, "KW", P.hyb_install);
    push("Transport", "Roadways", P.brand_transport, actualKw, "Lot", P.hyb_transport);
  } else {
    // Micro inverter: Quotify prices and describes the module at the settings DCR default wattage.
    const dw = P.dcr_panel_w;
    const panelUnit = Math.round(num("dcr_pw_" + dw, 27.5) * dw);
    push("Module Bifacial DCR", `Bifacial ${dw}W`, P.brand_dcr_panel, panels, "Nos", panelUnit);
    push("Micro Inverter", "Per Panel AC Module", P.brand_micro_inv, panels, "Nos", P.micro_inv);
    push("Module Mounting Structure", structDesc, P.brand_structure, panels, "Nos", structUnit);
    push("DC Cable & Connectors", `${dc} sq.mm with MC4`, P.brand_dc_cable, 1, "As Req", 4000);
    push("Copper Cable, PVC Insulated", `3C, ${ac} sq.mm`, P.brand_ac_cable, 1, "As Req", P.dcr_accable);
    push("Earth Pit", "Earth pit & Chambers", "Customized", 3, "Nos", P.earth_kit);
    push("Earth Cable", `${earthCableLen}m`, P.brand_earth_cable, earthCableLen, "Mts", P.earth_cable);
    push("Lightning Arrestor", "Spike", P.brand_lightning, 1, "No", P.lightning);
    push("Miscellaneous Items", "plugs, screws, connectors", "Multiple", 1, "Set", P.dcr_misc);
    push("Transport", "Roadways", P.brand_transport, actualKw, "Lot", P.transport);
    push("Installation", "End to End", compName, actualKw, "KW", P.install);
  }
  // User-added components (Settings → Common Components) apply to every system type.
  custom.components.forEach((c) => {
    if (!c.name || !(c.price > 0)) return;
    push(c.name, "", "-", c.perKw ? actualKw : 1, c.perKw ? "KW" : "No", c.price);
  });
  return { items, inv };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monthly grid units from the form's bi-monthly units, or — failing that — the bi-monthly bill. */
export function monthlyUnitsFromForm(bimonthlyUnits: number | null | undefined, bimonthlyBill: number | null | undefined): number {
  let monthly = (bimonthlyUnits ?? 0) / 2;
  if (!monthly && bimonthlyBill) monthly = reverseCalcTNEBBimonthlyUnits(bimonthlyBill) / 2;
  return monthly > 0 ? monthly : 0;
}

export function computeQuotify(inputRaw: QuotifyInput, Pbase: QuotifyPrices, custom: QuotifyCustomRows, opts: QuotifyOptions): QuotifyResult {
  const input = { ...inputRaw };
  // Front-end brand overrides — what the salesperson picked on the form wins over the defaults.
  const P = { ...Pbase } as QuotifyPrices;
  const pb = input.panelBrand?.trim();
  if (pb) {
    if (input.panelType === "bifacial") P.brand_dcr_panel = pb;
    else P.brand_ndcr_panel = pb;
  }
  const ib = input.inverterBrand?.trim();
  if (ib) {
    if (input.systemType === "hybrid") P.brand_hybrid_inv = ib;
    else if (input.systemType === "micro") P.brand_micro_inv = ib;
    else P.brand_ongrid_inv = ib;
  }

  let solarKw: number;
  let monthlyGridUnits = 0;
  if (input.sizeMode === "direct") {
    if (!input.directKw || input.directKw <= 0) throw new QuotifyInputError("Please enter the system size in kW.");
    solarKw = input.directKw;
  } else {
    const monthlyUnits = monthlyUnitsFromForm(input.bimonthlyUnits, input.bimonthlyBill);
    if (!monthlyUnits) throw new QuotifyInputError("Please enter the bi-monthly units or bill amount.");
    monthlyGridUnits = monthlyUnits;
    solarKw = monthlyUnits / 30 / (P.peak_sun * (P.efficiency / 100));
  }

  const settingsDefaultW = input.panelType === "hjt" ? P.hjt_panel_w : input.panelType === "topcon" ? P.topcon_panel_w : input.systemType === "ndcr" ? P.ndcr_panel_w : P.dcr_panel_w;
  const panelWatt = input.panelWatt && input.panelWatt > 0 ? input.panelWatt : settingsDefaultW;
  const rawPanels = (solarKw * 1000) / panelWatt;
  const panels = Math.max(1, rawPanels % 1 < 0.5 ? Math.floor(rawPanels) : Math.ceil(rawPanels));
  const actualKw = round2((panels * panelWatt) / 1000);

  const { items, inv } = buildItems(actualKw, panels, panelWatt, input, P, custom, opts.companyName);
  let itemsSubTotal = 0;
  let totalGST = 0;
  const rows: QuotifyRow[] = items.map((item) => {
    if (item.incl) return { ...item, sub: 0, gstAmt: 0, total: 0 };
    const sub = item.qty * item.unit;
    const gstAmt = sub * QUOTIFY_GST;
    itemsSubTotal += sub;
    totalGST += gstAmt;
    return { ...item, sub, gstAmt, total: sub + gstAmt };
  });

  const margin = Math.round((itemsSubTotal * P.margin) / 100);
  const marginGST = Math.round(margin * QUOTIFY_GST);
  const calcTotal = itemsSubTotal + totalGST + margin + marginGST;
  const blendedGST = totalGST + marginGST;
  const blendPct = itemsSubTotal + margin > 0 ? parseFloat(((blendedGST / (itemsSubTotal + margin)) * 100).toFixed(1)) : 0;

  const overridden = Boolean(input.overrideTotal && input.overrideTotal >= 1000);
  const grandTotal = overridden ? Math.round(input.overrideTotal as number) : calcTotal;
  let preTax = itemsSubTotal + margin;
  let gst = blendedGST;
  if (overridden) {
    // Reverse the blended GST out of the typed final price so the books stay balanced.
    preTax = blendPct > 0 ? Math.round(grandTotal / (1 + blendPct / 100)) : grandTotal;
    gst = grandTotal - preTax;
  }

  const centralSubsidy = input.systemType === "dcr" ? calcCentralSubsidy(actualKw) : 0;
  const stateSubsidy = input.systemType === "dcr" ? calcStateSubsidy(actualKw, opts.stateSubsidy) : 0;
  const subsidy = centralSubsidy + stateSubsidy;
  const netCost = grandTotal - subsidy;
  const savings = calcSavings(actualKw, netCost, P);
  const sysLabel = SYS_LABEL[input.systemType];

  return {
    monthlyGridUnits,
    solarKw,
    panelWatt,
    panels,
    actualKw,
    inverterKw: inv.effKw,
    inverterLabel: inv.size,
    rows,
    itemsSubTotal,
    margin,
    preTax,
    gst,
    blendPct,
    calcTotal,
    grandTotal,
    overridden,
    centralSubsidy,
    stateSubsidy,
    subsidy,
    netCost,
    savings,
    sysLabel,
    structLabel: input.structure === "highrise" ? "with Elevated Structure" : "with Ground Mount Structure",
    title: `Offer for ${actualKw}kW ${sysLabel} Solar Power Plant`,
    brands: {
      panel: input.systemType === "micro" || input.panelType === "bifacial" ? P.brand_dcr_panel : P.brand_ndcr_panel,
      inverter: input.systemType === "hybrid" ? P.brand_hybrid_inv : input.systemType === "micro" ? P.brand_micro_inv : P.brand_ongrid_inv,
    },
  };
}

/** Everything a Quotify quotation depends on — stored with it so its document can be re-rendered exactly later. */
export interface QuotifySnapshot {
  v: 1;
  input: QuotifyInput;
  prices: QuotifyPrices;
  custom: QuotifyCustomRows;
  stateSubsidy: boolean;
  paymentStages: { name: string; pct: number; when: string }[];
  customer: { name: string; phone: string; address: string; pincode: string; ebNumber: string };
  result: QuotifyResult;
}

export function isQuotifySnapshot(v: unknown): v is QuotifySnapshot {
  return Boolean(v && typeof v === "object" && (v as { v?: unknown }).v === 1 && (v as { result?: unknown }).result);
}

/** The org's resolved price sheet and options, from Settings → Quotation prices. */
export function quotationConfig(s: OrgSettings) {
  const custom = s.quotation.custom as QuotifyCustomRows;
  return { P: resolvePrices(s.quotation.prices, custom), custom, stateSubsidy: s.quotation.stateSubsidy, defaultPanelType: s.quotation.defaultPanelType as PanelTech };
}

export function fmtINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

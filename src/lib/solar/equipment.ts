/**
 * Equipment catalog + string sizing + DC/AC cable sizing.
 *
 * Catalog values are typical datasheet figures for popular models sold in India. Manufacturers
 * revise datasheets often (and bins vary ±5 Wp), so always confirm against the datasheet of the
 * exact lot you install — every entry can be overridden with a custom module/inverter.
 */

export interface ModuleModel {
  id: string;
  brand: string;
  model: string;
  tech: "Mono PERC" | "Bifacial PERC" | "TOPCon" | "Bifacial TOPCon" | "HJT" | "Polycrystalline";
  dcr: boolean; // Domestic Content Requirement (eligible for PM Surya Ghar subsidy)
  watt: number;
  /** mm */
  length: number;
  width: number;
  voc: number;
  isc: number;
  vmp: number;
  imp: number;
  /** %/°C (negative) */
  tempCoeffVoc: number;
  tempCoeffPmax: number;
  efficiency: number;
  custom?: boolean;
}

export interface InverterModel {
  id: string;
  brand: string;
  model: string;
  phase: "single" | "three";
  acKw: number;
  maxDcKw: number;
  maxDcV: number;
  mpptMinV: number;
  mpptMaxV: number;
  startV: number;
  mppts: number;
  stringsPerMppt: number;
  /** Max short-circuit current per MPPT, A */
  maxIscPerMppt: number;
  custom?: boolean;
}

const m = (
  id: string, brand: string, model: string, tech: ModuleModel["tech"], dcr: boolean, watt: number, length: number, width: number,
  voc: number, isc: number, vmp: number, imp: number, tempCoeffVoc: number, tempCoeffPmax: number,
): ModuleModel => ({ id, brand, model, tech, dcr, watt, length, width, voc, isc, vmp, imp, tempCoeffVoc, tempCoeffPmax, efficiency: Math.round((watt / ((length / 1000) * (width / 1000) * 1000)) * 1000) / 10 });

export const MODULES: ModuleModel[] = [
  // ── Indian manufacturers (DCR and non-DCR lines)
  m("waaree-arka-540", "Waaree", "Arka WS-540 (Mono PERC 144HC)", "Mono PERC", false, 540, 2278, 1134, 49.6, 13.86, 41.6, 12.98, -0.27, -0.35),
  m("waaree-bi-545", "Waaree", "Bi-55-545 (Bifacial 144HC)", "Bifacial PERC", false, 545, 2278, 1134, 49.8, 13.92, 41.8, 13.04, -0.27, -0.35),
  m("waaree-dcr-540", "Waaree", "WSMDi-540 DCR (Mono PERC)", "Mono PERC", true, 540, 2278, 1134, 49.5, 13.85, 41.5, 13.01, -0.28, -0.36),
  m("waaree-topcon-580", "Waaree", "Elite WTN-580 (TOPCon 144HC)", "Bifacial TOPCon", false, 580, 2278, 1134, 51.8, 14.18, 43.0, 13.49, -0.25, -0.30),
  m("adani-shine-540", "Adani Solar", "Shine ASM-540 (Mono PERC 144HC)", "Mono PERC", false, 540, 2278, 1134, 49.5, 13.90, 41.6, 12.99, -0.27, -0.35),
  m("adani-dcr-545", "Adani Solar", "Eternal ASB-545 DCR (Bifacial)", "Bifacial PERC", true, 545, 2278, 1134, 49.7, 13.95, 41.7, 13.07, -0.27, -0.35),
  m("adani-topcon-580", "Adani Solar", "Elan Shine TOPCon 580", "Bifacial TOPCon", false, 580, 2278, 1134, 51.9, 14.15, 43.1, 13.46, -0.25, -0.30),
  m("vikram-prexos-545", "Vikram Solar", "Prexos VSMDHT.72.545 (Bifacial)", "Bifacial PERC", false, 545, 2278, 1134, 49.9, 13.93, 41.9, 13.01, -0.27, -0.35),
  m("vikram-dcr-540", "Vikram Solar", "Somera DCR 540 (Mono PERC)", "Mono PERC", true, 540, 2278, 1134, 49.6, 13.84, 41.6, 12.98, -0.28, -0.36),
  m("vikram-hypersol-580", "Vikram Solar", "Hypersol TOPCon 580", "Bifacial TOPCon", false, 580, 2278, 1134, 51.7, 14.20, 42.9, 13.52, -0.25, -0.30),
  m("tata-tp545", "Tata Power Solar", "TP545 DCR (Mono PERC 144HC)", "Mono PERC", true, 545, 2278, 1134, 49.8, 13.90, 41.8, 13.04, -0.28, -0.36),
  m("tata-tp400", "Tata Power Solar", "TP400 DCR (Mono PERC 144HC)", "Mono PERC", true, 400, 2015, 996, 49.3, 10.35, 41.1, 9.74, -0.29, -0.37),
  m("premier-545", "Premier Energies", "PE-545HB DCR (Bifacial)", "Bifacial PERC", true, 545, 2278, 1134, 49.8, 13.94, 41.8, 13.04, -0.27, -0.35),
  m("goldi-540", "Goldi Solar", "HELOC Plus 540 (Mono PERC)", "Mono PERC", false, 540, 2278, 1134, 49.5, 13.88, 41.5, 13.02, -0.28, -0.36),
  m("goldi-dcr-550", "Goldi Solar", "HELOC Pro DCR 550 (Bifacial)", "Bifacial PERC", true, 550, 2278, 1134, 50.0, 13.98, 42.0, 13.10, -0.27, -0.35),
  m("rayzon-545", "Rayzon Solar", "RS-545 Titan (Mono PERC 144HC)", "Mono PERC", false, 545, 2278, 1134, 49.7, 13.92, 41.7, 13.07, -0.28, -0.36),
  m("rayzon-dcr-540", "Rayzon Solar", "RS-540 DCR", "Mono PERC", true, 540, 2278, 1134, 49.5, 13.86, 41.5, 13.01, -0.28, -0.36),
  m("saatvik-545", "Saatvik", "SGE-545 (Bifacial 144HC)", "Bifacial PERC", false, 545, 2278, 1134, 49.8, 13.91, 41.8, 13.04, -0.27, -0.35),
  m("renewsys-540", "RenewSys", "DESERV Galactic 540 DCR", "Mono PERC", true, 540, 2278, 1134, 49.6, 13.85, 41.6, 12.98, -0.28, -0.36),
  m("emmvee-545", "Emmvee", "ES-545M72 DCR", "Mono PERC", true, 545, 2278, 1134, 49.8, 13.90, 41.8, 13.04, -0.28, -0.36),
  m("loom-540", "Loom Solar", "Shark 540 (Bifacial)", "Bifacial PERC", false, 540, 2278, 1134, 49.6, 13.87, 41.6, 12.98, -0.27, -0.35),
  m("navitas-545", "Navitas", "NAV-545 DCR (Mono PERC)", "Mono PERC", true, 545, 2278, 1134, 49.8, 13.92, 41.8, 13.04, -0.28, -0.36),
  m("generic-poly-335", "Generic", "335 Wp Polycrystalline 72-cell", "Polycrystalline", true, 335, 1956, 992, 46.0, 9.35, 37.6, 8.91, -0.31, -0.40),
  // ── Global Tier-1
  m("longi-himo5-540", "LONGi", "Hi-MO 5 LR5-72HPH-540M", "Mono PERC", false, 540, 2256, 1133, 49.5, 13.85, 41.65, 12.97, -0.265, -0.34),
  m("longi-himo6-580", "LONGi", "Hi-MO 6 LR5-72HTH-580M", "HJT", false, 580, 2278, 1134, 52.15, 14.10, 43.6, 13.31, -0.23, -0.29),
  m("jinko-tigerneo-575", "Jinko Solar", "Tiger Neo JKM575N-72HL4-V", "Bifacial TOPCon", false, 575, 2278, 1134, 51.07, 14.31, 42.17, 13.64, -0.25, -0.29),
  m("jinko-tigerpro-540", "Jinko Solar", "Tiger Pro JKM540M-72HL4-V", "Mono PERC", false, 540, 2274, 1134, 49.42, 13.94, 40.9, 13.20, -0.28, -0.35),
  m("trina-de19-550", "Trina Solar", "Vertex TSM-DE19-550", "Mono PERC", false, 550, 2384, 1096, 37.9, 18.52, 31.6, 17.40, -0.25, -0.34),
  m("trina-ne19r-580", "Trina Solar", "Vertex N TSM-NEG19RC-580", "Bifacial TOPCon", false, 580, 2384, 1134, 41.2, 17.85, 34.4, 16.86, -0.25, -0.30),
  m("ja-jam72s30-545", "JA Solar", "JAM72S30-545/MR", "Mono PERC", false, 545, 2279, 1134, 49.85, 13.94, 41.8, 13.04, -0.272, -0.35),
  m("canadian-hiku6-545", "Canadian Solar", "HiKu6 CS6W-545MS", "Mono PERC", false, 545, 2261, 1134, 49.8, 13.95, 41.7, 13.07, -0.26, -0.34),
  m("canadian-topbihiku-580", "Canadian Solar", "TOPBiHiKu6 CS6W-580TB", "Bifacial TOPCon", false, 580, 2278, 1134, 52.0, 14.10, 43.3, 13.40, -0.26, -0.29),
];

const inv = (
  id: string, brand: string, model: string, phase: InverterModel["phase"], acKw: number, maxDcKw: number, maxDcV: number,
  mpptMinV: number, mpptMaxV: number, startV: number, mppts: number, stringsPerMppt: number, maxIscPerMppt: number,
): InverterModel => ({ id, brand, model, phase, acKw, maxDcKw, maxDcV, mpptMinV, mpptMaxV, startV, mppts, stringsPerMppt, maxIscPerMppt });

export const INVERTERS: InverterModel[] = [
  inv("growatt-min-3000", "Growatt", "MIN 3000TL-X", "single", 3, 4.5, 550, 80, 550, 100, 1, 1, 16.9),
  inv("growatt-min-5000", "Growatt", "MIN 5000TL-X", "single", 5, 7.5, 550, 80, 550, 100, 2, 1, 16.9),
  inv("growatt-min-6000", "Growatt", "MIN 6000TL-X", "single", 6, 9, 550, 80, 550, 100, 2, 1, 16.9),
  inv("growatt-mod-10k", "Growatt", "MOD 10KTL3-X", "three", 10, 15, 1100, 140, 1000, 160, 2, 1, 16.9),
  inv("growatt-mid-15k", "Growatt", "MID 15KTL3-X", "three", 15, 22.5, 1100, 200, 1000, 250, 2, 2, 32),
  inv("growatt-mid-20k", "Growatt", "MID 20KTL3-X", "three", 20, 30, 1100, 200, 1000, 250, 2, 2, 32),
  inv("solis-s6-3k", "Solis", "S6-GR1P3K", "single", 3, 4.8, 600, 90, 520, 120, 1, 1, 22),
  inv("solis-s6-5k", "Solis", "S6-GR1P5K", "single", 5, 8, 600, 90, 520, 120, 2, 1, 22),
  inv("solis-s5-10k", "Solis", "S5-GC10K", "three", 10, 16, 1100, 160, 1000, 180, 2, 1, 22),
  inv("sungrow-sg3-0rs", "Sungrow", "SG3.0RS", "single", 3, 4.5, 600, 40, 560, 50, 1, 1, 20),
  inv("sungrow-sg5-0rs", "Sungrow", "SG5.0RS", "single", 5, 7.5, 600, 40, 560, 50, 2, 1, 20),
  inv("sungrow-sg10rt", "Sungrow", "SG10RT", "three", 10, 15, 1100, 160, 1000, 180, 2, 1, 20),
  inv("sungrow-sg15rt", "Sungrow", "SG15RT", "three", 15, 22.5, 1100, 160, 1000, 180, 2, 2, 40),
  inv("huawei-5ktl-l1", "Huawei", "SUN2000-5KTL-L1", "single", 5, 7.5, 600, 90, 560, 100, 2, 1, 15),
  inv("huawei-10ktl-m1", "Huawei", "SUN2000-10KTL-M1", "three", 10, 15, 1100, 140, 980, 200, 2, 1, 15),
  inv("deye-sun-5k-g", "Deye", "SUN-5K-G05", "single", 5, 6.5, 500, 80, 450, 90, 2, 1, 16.9),
  inv("polycab-psis-3k", "Polycab", "PSIS-3K-SM", "single", 3, 4, 550, 80, 520, 100, 1, 1, 15),
  inv("havells-3k", "Havells", "Enviro GTI 3 kW", "single", 3, 4.2, 550, 70, 520, 100, 1, 1, 16),
  inv("fronius-primo-5", "Fronius", "Primo 5.0-1", "single", 5, 7.5, 1000, 80, 800, 80, 2, 1, 18),
  inv("sma-sb-5", "SMA", "Sunny Boy 5.0", "single", 5, 7.5, 600, 60, 500, 80, 2, 1, 15),
];

export const DEFAULT_MODULE_ID = "waaree-arka-540";

export function findModule(id: string | undefined, custom: ModuleModel[] = []): ModuleModel | undefined {
  return [...custom, ...MODULES].find((x) => x.id === id);
}
export function findInverter(id: string | undefined, custom: InverterModel[] = []): InverterModel | undefined {
  return [...custom, ...INVERTERS].find((x) => x.id === id);
}

// ─── String sizing ─────────────────────────────────────────────────────

export interface SiteTemps {
  /** Record-low ambient, °C (cold → highest Voc). */
  minC: number;
  /** Design-high ambient, °C. Cell runs ≈ 30 °C above ambient at 1000 W/m². */
  maxC: number;
}

export function stringLimits(mod: ModuleModel, iv: InverterModel, t: SiteTemps) {
  const vocCold = mod.voc * (1 + (mod.tempCoeffVoc / 100) * (t.minC - 25));
  const vmpCold = mod.vmp * (1 + (mod.tempCoeffVoc / 100) * (t.minC - 25));
  const vmpHot = mod.vmp * (1 + (mod.tempCoeffVoc / 100) * (t.maxC + 30 - 25));
  const maxBySafety = Math.floor(iv.maxDcV / vocCold);
  const maxByMppt = Math.floor(iv.mpptMaxV / vmpCold);
  const minByMppt = Math.ceil(Math.max(iv.mpptMinV, iv.startV) / vmpHot);
  const max = Math.min(maxBySafety, maxByMppt);
  return { min: Math.max(1, minByMppt), max, vocCold, vmpHot, vmpCold, maxBySafety, maxByMppt };
}

/** Array short-circuit current at the hottest cell temperature (IEC 62548: Isc rises ~0.05 %/°C). */
export function iscHot(mod: ModuleModel, t: SiteTemps) {
  return mod.isc * (1 + 0.0005 * (t.maxC + 30 - 25));
}

export interface StringDef {
  id: string;
  inverterIndex: number;
  mppt: number;
  /** Global panel ids "zoneId|row:col", in wiring order. */
  panels: string[];
}

export interface InverterInstance {
  id: string;
  modelId: string;
}

export interface StringCheck {
  ok: boolean;
  issues: string[];
}

/** Validate a string against the inverter window and its MPPT's current limit. */
export function checkString(s: StringDef, all: StringDef[], mod: ModuleModel, iv: InverterModel, t: SiteTemps): StringCheck {
  const lim = stringLimits(mod, iv, t);
  const n = s.panels.length;
  const issues: string[] = [];
  if (n > lim.maxBySafety) issues.push(`Voc at ${t.minC}°C = ${(n * lim.vocCold).toFixed(0)} V exceeds ${iv.maxDcV} V max DC input`);
  else if (n > lim.maxByMppt) issues.push(`Above MPPT window when cold (${(n * lim.vmpCold).toFixed(0)} V > ${iv.mpptMaxV} V), so it will clip`);
  if (n < lim.min) issues.push(`Vmp when hot = ${(n * lim.vmpHot).toFixed(0)} V, below ${Math.max(iv.mpptMinV, iv.startV)} V MPPT/start voltage`);
  const peers = all.filter((x) => x.inverterIndex === s.inverterIndex && x.mppt === s.mppt);
  if (peers.length > iv.stringsPerMppt) issues.push(`MPPT ${s.mppt + 1} accepts ${iv.stringsPerMppt} string(s), has ${peers.length}`);
  if (peers.some((p) => p.panels.length !== n)) issues.push(`Unequal string lengths on MPPT ${s.mppt + 1}`);
  const isc = iscHot(mod, t) * peers.length;
  if (isc > iv.maxIscPerMppt * 1.0001) issues.push(`Isc (hot) = ${isc.toFixed(1)} A exceeds ${iv.maxIscPerMppt} A short-circuit rating of MPPT ${s.mppt + 1}`);
  return { ok: issues.length === 0, issues };
}

/** Pick the smallest catalog inverter for a DC size (DC/AC 1.0–1.35) and phase. */
export function suggestInverter(dcKw: number, phase: "single" | "three", catalog: InverterModel[] = INVERTERS): InverterModel | undefined {
  const fits = catalog.filter((i) => i.phase === phase && i.acKw >= dcKw / 1.35 && i.maxDcKw >= dcKw).sort((a, b) => a.acKw - b.acKw);
  return fits[0] ?? catalog.filter((i) => i.phase === phase).sort((a, b) => b.acKw - a.acKw)[0];
}

/**
 * Auto-string: splits the ordered panel list (already in snake/wiring order) across inverters'
 * MPPTs with equal-as-possible string lengths inside the voltage window.
 */
export function autoString(orderedPanels: string[], mod: ModuleModel, inverters: { inst: InverterInstance; model: InverterModel }[], t: SiteTemps): { strings: StringDef[]; unstrung: string[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!inverters.length) return { strings: [], unstrung: orderedPanels, warnings: ["Add an inverter first"] };
  // Slots: every (inverter, mppt, string) position, interleaving MPPTs so each gets one string before doubling up.
  const slots: { inv: number; mppt: number; lim: ReturnType<typeof stringLimits> }[] = [];
  inverters.forEach((iv, i) => {
    const lim = stringLimits(mod, iv.model, t);
    for (let s = 0; s < iv.model.stringsPerMppt; s++) for (let k = 0; k < iv.model.mppts; k++) {
      if (iscHot(mod, t) * (s + 1) <= iv.model.maxIscPerMppt * 1.0001 || s === 0) slots.push({ inv: i, mppt: k, lim });
    }
  });
  const N = orderedPanels.length;
  const maxLen = Math.min(...slots.map((s) => s.lim.max));
  const minLen = Math.max(...slots.map((s) => s.lim.min));
  if (maxLen < minLen) return { strings: [], unstrung: orderedPanels, warnings: ["This module and inverter don't work together at your site's temperatures. Pick a different inverter."] };
  // Fewest strings that keep every string ≤ maxLen.
  let count = Math.max(1, Math.ceil(N / maxLen));
  if (count > slots.length) {
    count = slots.length;
    warnings.push(`The inverter can only take ${slots.length * maxLen} of your ${N} modules. Add another inverter or choose a bigger one.`);
  }
  // Prefer equal lengths: if N splits unevenly, drop panels that don't fit rather than mix lengths on one MPPT.
  let len = Math.min(maxLen, Math.floor(N / count));
  if (len < minLen) {
    count = Math.floor(N / minLen);
    len = minLen;
    if (count === 0) return { strings: [], unstrung: orderedPanels, warnings: [`This inverter needs at least ${minLen} modules in a string to start up. Add more modules or pick a smaller inverter.`] };
  }
  let extra = Math.min(N - len * count, count);
  if (len + 1 > maxLen) extra = 0;
  const strings: StringDef[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const n = len + (i < extra ? 1 : 0);
    const slot = slots[i];
    strings.push({ id: `S${i + 1}`, inverterIndex: slot.inv, mppt: slot.mppt, panels: orderedPanels.slice(cursor, cursor + n) });
    cursor += n;
  }
  const unstrung = orderedPanels.slice(cursor);
  if (unstrung.length) warnings.push(`${unstrung.length} module${unstrung.length === 1 ? "" : "s"} couldn't be wired into a safe string. Remove ${unstrung.length === 1 ? "it" : "them"} or add another inverter.`);
  return { strings, unstrung, warnings };
}

// ─── Cables ────────────────────────────────────────────────────────────

/** Copper resistivity at 70 °C conductor temperature, Ω·mm²/m. */
const RHO_CU_70 = 0.0216;
export const CABLE_SIZES = [2.5, 4, 6, 10, 16, 25];

export function dcVoltageDrop(lengthOneWayM: number, current: number, sizeMm2: number, stringV: number) {
  const vd = (2 * lengthOneWayM * current * RHO_CU_70) / sizeMm2;
  return { volts: vd, pct: stringV ? (vd / stringV) * 100 : 0, lossW: vd * current };
}

export function acVoltageDrop(lengthM: number, acKw: number, phase: "single" | "three", sizeMm2: number) {
  const v = phase === "single" ? 230 : 415;
  const i = phase === "single" ? (acKw * 1000) / v : (acKw * 1000) / (Math.sqrt(3) * v);
  const vd = phase === "single" ? (2 * lengthM * i * RHO_CU_70) / sizeMm2 : (Math.sqrt(3) * lengthM * i * RHO_CU_70) / sizeMm2;
  return { current: i, volts: vd, pct: (vd / v) * 100 };
}

/** Smallest standard size keeping drop under target (default 1.5% DC, 2% AC). */
export function pickCable(dropFor: (size: number) => number, targetPct: number) {
  return CABLE_SIZES.find((s) => dropFor(s) <= targetPct) ?? CABLE_SIZES[CABLE_SIZES.length - 1];
}

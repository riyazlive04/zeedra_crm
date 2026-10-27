/**
 * TANGEDCO / TNEB LT-IA domestic tariff — TNERC Order No. 6 of 2024 (effective 1 July 2024).
 * Billing in Tamil Nadu is bi-monthly (every 60 days), with a telescopic slab structure that
 * depends on which band total bi-monthly consumption falls into. All functions here work in
 * bi-monthly units/₹ — callers convert to/from the app's monthly figures (÷2 and ×2).
 */

export interface TneSlab {
  /** Inclusive lower bound of this slab, in bi-monthly units. */
  from: number;
  /** Inclusive upper bound, or null for the open-ended top slab. */
  to: number | null;
  ratePerUnit: number;
}

/** Tier A: total bi-monthly consumption ≤ 500 units — first 200 units free. */
const TIER_A: TneSlab[] = [
  { from: 1, to: 200, ratePerUnit: 0 },
  { from: 201, to: 400, ratePerUnit: 4.7 },
  { from: 401, to: 500, ratePerUnit: 6.3 },
];

/** Tier B: total bi-monthly consumption > 500 units — only the first 100 units are free. */
const TIER_B: TneSlab[] = [
  { from: 1, to: 100, ratePerUnit: 0 },
  { from: 101, to: 400, ratePerUnit: 4.7 },
  { from: 401, to: 500, ratePerUnit: 6.3 },
  { from: 501, to: 600, ratePerUnit: 8.4 },
  { from: 601, to: 800, ratePerUnit: 9.45 },
  { from: 801, to: 1000, ratePerUnit: 10.5 },
  { from: 1001, to: null, ratePerUnit: 11.55 },
];

/** The telescopic slab ladder that applies for a given total bi-monthly consumption. */
export function tnebSlabsFor(biMonthlyUnits: number): TneSlab[] {
  return biMonthlyUnits <= 500 ? TIER_A : TIER_B;
}

/** Forward calculation: bi-monthly units → bi-monthly bill (₹), via the telescopic slabs. */
export function tnebBillFromBiMonthlyUnits(biMonthlyUnits: number): number {
  const units = Math.max(0, biMonthlyUnits);
  if (units === 0) return 0;
  const slabs = tnebSlabsFor(units);
  let bill = 0;
  for (const slab of slabs) {
    if (units < slab.from) break;
    const upper = slab.to ?? units;
    const slabUnits = Math.min(units, upper) - slab.from + 1;
    if (slabUnits > 0) bill += slabUnits * slab.ratePerUnit;
  }
  return Math.round(bill);
}

/**
 * Reverse calculation: a bi-monthly bill amount (₹) → bi-monthly units, by inverting the
 * telescopic breakpoints (TNEB spec §3.2). The ₹1,570–₹2,040 range is the discontinuity where
 * Tier A tops out at 500 units (₹1,570) and Tier B's first paid slab starts fresh at 101 units —
 * bills in that gap are clamped to exactly 500 units, same as the reference implementation.
 */
export function tnebBiMonthlyUnitsFromBill(bill: number): number {
  const b = Math.max(0, bill);
  if (b <= 0) return 0;
  if (b <= 940) return 200 + b / 4.7;
  if (b <= 1570) return 400 + (b - 940) / 6.3;
  if (b <= 2040) return 500;
  if (b <= 2880) return 500 + (b - 2040) / 8.4;
  if (b <= 4770) return 600 + (b - 2880) / 9.45;
  if (b <= 6870) return 800 + (b - 4770) / 10.5;
  return 1000 + (b - 6870) / 11.55;
}

/** Monthly EB bill (what the sales team enters) → monthly units, via the bi-monthly TNEB table. */
export function tnebMonthlyUnitsFromMonthlyBill(monthlyBill: number): number {
  const biMonthlyUnits = tnebBiMonthlyUnitsFromBill(monthlyBill * 2);
  return biMonthlyUnits / 2;
}

/** Monthly units → monthly bill, via the bi-monthly TNEB table (used for "new bill after solar"). */
export function tnebMonthlyBillFromMonthlyUnits(monthlyUnits: number): number {
  return tnebBillFromBiMonthlyUnits(monthlyUnits * 2) / 2;
}

import { z } from "zod";

/**
 * Tenant-level business configuration. Every number that differs between states,
 * DISCOMs or installers lives here so the same product works for any solar EPC.
 */
export const orgSettingsSchema = z.object({
  currency: z.string().default("INR"),
  state: z.string().default("Tamil Nadu"),

  // Electricity & generation
  tariffPerUnit: z.number().positive().default(8),
  fixedChargesMonthly: z.number().min(0).default(120),
  exportTariffPerUnit: z.number().min(0).default(3.1),
  specificYield: z.number().positive().default(1400), // kWh per kWp per year
  degradationPct: z.number().min(0).max(5).default(0.5),
  tariffEscalationPct: z.number().min(0).max(15).default(3),
  gridEmissionFactor: z.number().positive().default(0.72), // kg CO2 per kWh (CEA)
  roofSqftPerKw: z.number().positive().default(100),

  // Equipment catalogue
  panelBrands: z.array(z.string()).default(["Waaree", "Adani", "Tata Power Solar", "Vikram Solar", "Premier Energies"]),
  inverterBrands: z.array(z.string()).default(["Growatt", "Sungrow", "Solis", "Havells", "Polycab"]),
  defaultPanelBrand: z.string().default("Waaree"),
  defaultPanelWattage: z.number().int().positive().default(550),
  defaultInverterBrand: z.string().default("Growatt"),

  // Pricing (pre-GST, per kWp, slab by system size)
  priceSlabs: z
    .array(z.object({ upToKw: z.number().positive(), ratePerKw: z.number().positive() }))
    .default([
      { upToKw: 3, ratePerKw: 58000 },
      { upToKw: 10, ratePerKw: 52000 },
      { upToKw: 50, ratePerKw: 46000 },
      { upToKw: 100000, ratePerKw: 40000 },
    ]),
  gstRate: z.number().min(0).max(28).default(8.9), // composite: 70% goods @5% + 30% services @18%
  quotationValidityDays: z.number().int().positive().default(15),

  // Installation & balance-of-system build costs (₹/kW unless noted), used to itemise the BOM on every proposal
  bomRates: z
    .object({
      mountingPerKw: z.number().min(0),
      dcdbPerKw: z.number().min(0),
      acdbPerKw: z.number().min(0),
      dcCablePerKw: z.number().min(0),
      acCablePerKw: z.number().min(0),
      miscPerKw: z.number().min(0),
      installationPerKw: z.number().min(0),
      transportPerKw: z.number().min(0),
      netMeteringPerKw: z.number().min(0),
      lightningArrestorEach: z.number().min(0),
      earthingKitEach: z.number().min(0),
    })
    .default({
      mountingPerKw: 6200,
      dcdbPerKw: 800,
      acdbPerKw: 800,
      dcCablePerKw: 1000,
      acCablePerKw: 1000,
      miscPerKw: 800,
      installationPerKw: 3600,
      transportPerKw: 500,
      netMeteringPerKw: 500,
      lightningArrestorEach: 1200,
      earthingKitEach: 1500,
    }),

  // Subsidy — PM Surya Ghar Muft Bijli Yojana (central) + optional state top-up
  centralSubsidyEnabled: z.boolean().default(true),
  // Flat amount by system-size tier, e.g. Tamil Nadu G.O. 102: ₹5k (1 kW) / ₹10k (2 kW) / ₹22k (3 kW+)
  stateSubsidyTiers: z
    .array(z.object({ upToKw: z.number().positive(), amount: z.number().min(0) }))
    .default([
      { upToKw: 1, amount: 5000 },
      { upToKw: 2, amount: 10000 },
      { upToKw: 3, amount: 22000 },
    ]),

  // Finance
  loanRatePct: z.number().min(0).max(30).default(7),
  loanTenureMonths: z.number().int().positive().default(84),
  loanDownPaymentPct: z.number().min(0).max(100).default(10),

  // Qualification thresholds
  minMonthlyBillResidential: z.number().min(0).default(1200),
  minMonthlyBillCommercial: z.number().min(0).default(5000),
  requireOwnership: z.boolean().default(true),
  hotScore: z.number().min(0).max(100).default(70),
  warmScore: z.number().min(0).max(100).default(40),

  // Field-sales validation (GPS + time)
  geofenceRadiusM: z.number().positive().default(200),
  maxGpsAccuracyM: z.number().positive().default(100),
  maxClockDriftMin: z.number().positive().default(5),
  appointmentWindowBeforeMin: z.number().min(0).default(60),
  appointmentWindowAfterMin: z.number().min(0).default(180),
  maxTravelSpeedKmph: z.number().positive().default(120),
  requireAppointmentForQuote: z.boolean().default(false),

  // Scheduling
  workdayStart: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  workdayEnd: z.string().regex(/^\d{2}:\d{2}$/).default("19:00"),
  slotMinutes: z.number().int().positive().default(60),
  workdays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5, 6]),
  timezone: z.string().default("Asia/Kolkata"),

  // Lead routing
  autoAssign: z.enum(["NONE", "ROUND_ROBIN", "LEAST_LOADED"]).default("ROUND_ROBIN"),
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export const DEFAULT_SETTINGS: OrgSettings = orgSettingsSchema.parse({});

/** Parse settings JSON from the DB, filling any keys added in newer releases with defaults. */
export function parseSettings(raw: unknown): OrgSettings {
  const result = orgSettingsSchema.safeParse(raw ?? {});
  if (result.success) return result.data;
  // Corrupt keys fall back individually rather than breaking the tenant.
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const probe = orgSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, [k]: v });
      if (probe.success) merged[k] = v;
    }
  }
  return orgSettingsSchema.parse(merged);
}

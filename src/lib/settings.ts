import { z } from "zod";
import { PROJECT_WORKFLOW_DEFAULTS } from "./defaults";

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

  // Pricing (pre-GST, per kWp, slab by system size) — superseded by the bottom-up BoQ costing
  // below (panelRatePerWatt + bomRates) as the subtotal driver; kept only so existing saved
  // settings and the slab editor in Settings → Pricing keep working, and as a fallback rate.
  priceSlabs: z
    .array(z.object({ upToKw: z.number().positive(), ratePerKw: z.number().positive() }))
    .default([
      { upToKw: 3, ratePerKw: 60000 },
      { upToKw: 10, ratePerKw: 54000 },
      { upToKw: 50, ratePerKw: 47000 },
      { upToKw: 100000, ratePerKw: 42000 },
    ]),
  // Per-watt panel rate used for bottom-up BoQ costing (the primary subtotal driver).
  panelRatePerWatt: z.number().positive().default(30),
  // Company margin layered on the BoQ cost before GST, e.g. for a 0% "contractor passthrough"
  // quote vs a margin-carrying retail quote. 0 by default — purely additive to existing pricing.
  marginPct: z.number().min(0).max(100).default(0),
  gstRate: z.number().min(0).max(28).default(8.9), // composite: 70% goods @5% + 30% services @18%
  quotationValidityDays: z.number().int().positive().default(15),

  // Use the exact TANGEDCO/TNEB telescopic bi-monthly tariff table (instead of the flat
  // ₹/unit tariffPerUnit) to convert a customer's EB bill to units and back. Tamil Nadu only —
  // leave off for other states, where tariffPerUnit's simple linear estimate is more appropriate.
  tnebTariffEnabled: z.boolean().default(false),

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
      mountingPerKw: 5000,
      dcdbPerKw: 2000,
      acdbPerKw: 2000,
      dcCablePerKw: 2000,
      acCablePerKw: 2000,
      miscPerKw: 2000,
      installationPerKw: 3000,
      transportPerKw: 1000,
      netMeteringPerKw: 500,
      lightningArrestorEach: 5000,
      earthingKitEach: 5000,
    }),

  // On-grid inverter prices by size, one admin-set catalogue for each phase type. Looked up by
  // the inverter kW the system sizing picks — the next size up if there's no exact match.
  inverterPrices: z
    .object({
      singlePhase: z.array(z.object({ kw: z.number().positive(), price: z.number().min(0) })),
      threePhase: z.array(z.object({ kw: z.number().positive(), price: z.number().min(0) })),
    })
    .default({
      singlePhase: [
        { kw: 3, price: 14000 },
        { kw: 4, price: 17500 },
        { kw: 5, price: 25000 },
      ],
      threePhase: [
        { kw: 4, price: 22000 },
        { kw: 5, price: 26000 },
        { kw: 6, price: 36000 },
        { kw: 8, price: 46000 },
        { kw: 10, price: 62000 },
      ],
    }),

  // Subsidy — PM Surya Ghar Muft Bijli Yojana (central) + optional state top-up.
  // Two claim types, each priced independently so an admin sets the rates once:
  //  - House: per-kW tiers (e.g. ₹30k/kW up to 2 kW, ₹18k the 3rd kW), capped at a max amount.
  //  - Community (housing society / RWA common facilities): a flat ₹/kW rate, capped at a max system size.
  centralSubsidyEnabled: z.boolean().default(true),
  subsidyRates: z
    .object({
      house: z
        .object({
          tiers: z
            .array(z.object({ uptoKw: z.number().positive(), ratePerKw: z.number().min(0) }))
            .default([
              { uptoKw: 2, ratePerKw: 30000 },
              { uptoKw: 3, ratePerKw: 18000 },
            ]),
          maxAmount: z.number().min(0).default(78000),
        })
        .default({
          tiers: [
            { uptoKw: 2, ratePerKw: 30000 },
            { uptoKw: 3, ratePerKw: 18000 },
          ],
          maxAmount: 78000,
        }),
      community: z
        .object({ ratePerKw: z.number().min(0).default(18000), maxKw: z.number().positive().default(500) })
        .default({ ratePerKw: 18000, maxKw: 500 }),
    })
    .default({
      house: {
        tiers: [
          { uptoKw: 2, ratePerKw: 30000 },
          { uptoKw: 3, ratePerKw: 18000 },
        ],
        maxAmount: 78000,
      },
      community: { ratePerKw: 18000, maxKw: 500 },
    }),
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

  // Project workflow responsibilities — who gets the task when a project enters each stage.
  projectWorkflow: z
    .array(
      z.object({
        stage: z.string(),
        primaryUserId: z.string().nullable().default(null),
        coordinatorUserId: z.string().nullable().default(null),
        taskTitle: z.string().max(200).default(""),
        dueInDays: z.number().int().min(1).max(30).default(3),
      }),
    )
    .default(PROJECT_WORKFLOW_DEFAULTS),
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

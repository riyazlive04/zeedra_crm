import { z } from "zod";

const optStr = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v === "" ? null : v));
const optNum = z.preprocess(
  (v) => (v === "" || v === undefined ? null : typeof v === "string" ? Number(v) : v),
  z.number().finite().min(0).nullable().optional(),
);
const optBool = z.preprocess((v) => (v === "" || v === undefined ? null : v === "true" ? true : v === "false" ? false : v), z.boolean().nullable().optional());
const optCoord = (max: number) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : typeof v === "string" ? Number(v) : v), z.number().min(-max).max(max).nullable().optional());

export const SOURCES = ["WEBSITE", "FACEBOOK", "INSTAGRAM", "GOOGLE_ADS", "WHATSAPP", "REFERRAL", "WALK_IN", "JUSTDIAL", "INDIAMART", "CHANNEL_PARTNER", "COLD_CALL", "EXHIBITION", "OTHER"] as const;
export const SEGMENTS = ["RESIDENTIAL", "HOUSING_SOCIETY", "COMMERCIAL", "INDUSTRIAL", "AGRICULTURE", "INSTITUTIONAL"] as const;
export const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "QUOTATION_SENT", "NEGOTIATION", "WON", "LOST", "DISQUALIFIED"] as const;
export const ROOF_TYPES = ["RCC", "METAL_SHEET", "TILED", "ASBESTOS", "GROUND_MOUNT", "OTHER"] as const;
export const TIMELINES = ["IMMEDIATE", "WITHIN_1_MONTH", "ONE_TO_3_MONTHS", "THREE_TO_6_MONTHS", "EXPLORING"] as const;
export const PAYMENT_MODES = ["CASH", "LOAN", "PARTIAL_LOAN", "UNDECIDED"] as const;
export const OBJECTIONS = ["NONE", "PRICE", "FINANCE", "ROOF_ISSUE", "OWNERSHIP", "FAMILY_DECISION", "TRUST", "TIMING", "COMPETITOR", "OTHER"] as const;
export const LOAN_STATUSES = ["NOT_STARTED", "DOCS_PENDING", "APPLIED", "SANCTIONED", "REJECTED"] as const;
export const APPT_TYPES = ["SITE_VISIT", "QUOTATION_MEETING", "FOLLOW_UP_CALL", "LOAN_DOCUMENTATION", "INSTALLATION"] as const;
export const ROLES = ["OWNER", "ADMIN", "SALES_MANAGER", "TELECALLER", "FIELD_SALES", "INSTALLER"] as const;

const nullableEnum = <T extends readonly [string, ...string[]]>(vals: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), z.enum(vals).nullable().optional());

export const leadContactSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  phone: z.string().trim().min(10, "Valid mobile number required").max(20),
  altPhone: optStr,
  email: z.preprocess((v) => (v === "" ? null : v), z.string().trim().email().nullable().optional()),
  whatsappOptIn: z.boolean().optional(),
  source: z.enum(SOURCES).optional(),
  campaign: optStr,
  segment: z.enum(SEGMENTS).optional(),
  address: optStr,
  city: optStr,
  district: optStr,
  state: optStr,
  pincode: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{6}$/, "6-digit PIN").nullable().optional()),
  lat: optCoord(90),
  lng: optCoord(180),
  tags: optStr,
  assignedToId: optStr,
});

export const basicQualSchema = z.object({
  monthlyBill: optNum,
  monthlyUnits: optNum,
  discom: optStr,
  consumerNumber: optStr,
  sanctionedLoadKw: optNum,
  phase: nullableEnum(["SINGLE", "THREE"] as const),
  ownsProperty: optBool,
  roofType: nullableEnum(ROOF_TYPES),
  roofAreaSqft: optNum,
  shadowFree: optBool,
  floors: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(100).nullable().optional()),
});

export const salesQualSchema = z.object({
  siteVisitReady: optBool,
  installationTimeline: nullableEnum(TIMELINES),
  paymentMode: nullableEnum(PAYMENT_MODES),
  budgetConfirmed: optBool,
  loanInterest: optBool,
  loanStatus: nullableEnum(LOAN_STATUSES),
  objection: nullableEnum(OBJECTIONS),
  objectionNote: optStr,
  decisionMakerMet: optBool,
  competitorQuote: optNum,
  nextFollowUpAt: z.preprocess((v) => (v === "" || v == null ? null : new Date(v as string)), z.date().nullable().optional()),
});

export const leadCreateSchema = leadContactSchema.merge(basicQualSchema).merge(salesQualSchema);
export const leadUpdateSchema = leadCreateSchema.partial();

export type LeadCreateInput = z.infer<typeof leadCreateSchema>;

import "server-only";
import type { GeoVerdict, Lead, LeadStage, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { parseSettings, type OrgSettings } from "../settings";
import { validateFieldCapture, type FieldCapture, type ValidationResult } from "../geo";
import { sizeSystem } from "../solar/sizing";
import { computeQuotify, isQuotifySnapshot, quotationConfig, PANEL_TECH_LABEL, QuotifyInputError, type QuotifyInput, type QuotifySnapshot } from "../solar/quotify";
import { loanPlan } from "../solar/finance";
import { nextQuotationNumber } from "../counter";
import { logActivity } from "../activity";
import { fireTrigger } from "../automation/engine";
import { ApiError } from "../errors";
import { can } from "../rbac";
import type { Session } from "../session";
import { getLeadForSession, onStageChanged, createLead } from "./leads";
import { formatINR, humanize } from "../text";
import { buildLineItems } from "../solar/quote";
import { leadCreateSchema } from "../validators";

export const captureSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(100_000).nullable().optional(),
    deviceTime: z.coerce.date().nullable().optional(),
  })
  .nullable();

const STAGE_ORDER: LeadStage[] = ["NEW", "CONTACTED", "QUALIFIED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "QUOTATION_SENT", "NEGOTIATION", "WON"];

/** Moves a lead forward (never backwards) through the pipeline. */
export async function advanceStage(leadId: string, to: LeadStage, actorId?: string | null) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  const from = STAGE_ORDER.indexOf(lead.stage);
  if (from === -1 || STAGE_ORDER.indexOf(to) <= from) return lead;
  const updated = await db.lead.update({ where: { id: leadId }, data: { stage: to } });
  await onStageChanged(updated, lead.stage, actorId);
  return updated;
}

async function validate(
  session: Session,
  s: OrgSettings,
  lead: { lat: number | null; lng: number | null; sitePinned: boolean },
  capture: FieldCapture | null,
  appointment: { startAt: Date; endAt: Date } | null,
): Promise<ValidationResult> {
  const serverTime = new Date();
  const lastPing = await db.locationPing.findFirst({
    where: { userId: session.userId, createdAt: { gte: new Date(serverTime.getTime() - 6 * 3_600_000) } },
    orderBy: { createdAt: "desc" },
  });
  return validateFieldCapture(
    {
      capture,
      serverTime,
      site: lead.lat != null && lead.lng != null ? { lat: lead.lat, lng: lead.lng, pinned: lead.sitePinned } : null,
      appointment,
      lastPing: lastPing ? { lat: lastPing.lat, lng: lastPing.lng, at: lastPing.createdAt } : null,
    },
    s,
  );
}

// ─── Check-in / check-out ────────────────────────────────────────────────

export async function checkIn(session: Session, appointmentId: string, capture: FieldCapture | null) {
  const appt = await db.appointment.findFirst({ where: { id: appointmentId, organizationId: session.orgId }, include: { lead: true } });
  if (!appt) throw new ApiError(404, "Appointment not found");
  if (appt.assignedToId !== session.userId && !can(session.role, "quotations:review"))
    throw new ApiError(403, "Only the assigned salesperson can check in");
  if (appt.status === "CANCELLED") throw new ApiError(400, "Appointment is cancelled");

  const org = await db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { settings: true } });
  const s = parseSettings(org.settings);
  const result = await validate(session, s, appt.lead, capture, appt);

  if (capture) {
    await db.locationPing.create({
      data: {
        organizationId: session.orgId,
        userId: session.userId,
        lat: capture.lat,
        lng: capture.lng,
        accuracyM: capture.accuracyM ?? null,
        deviceTime: capture.deviceTime ?? null,
        source: "CHECK_IN",
        refId: appt.id,
      },
    });
  }
  const updated = await db.appointment.update({
    where: { id: appt.id },
    data: {
      status: "CHECKED_IN",
      checkInAt: new Date(),
      checkInLat: capture?.lat ?? null,
      checkInLng: capture?.lng ?? null,
      checkInAccuracy: capture?.accuracyM ?? null,
      checkInDistanceM: result.distanceM,
      checkInVerdict: result.verdict,
    },
  });
  await logActivity({
    orgId: session.orgId,
    leadId: appt.leadId,
    userId: session.userId,
    type: "CHECK_IN",
    title: `Checked in for ${humanize(appt.type)} — ${humanize(result.verdict)}`,
    body: result.checks.map((c) => `${c.passed ? "✓" : "✗"} ${c.label}: ${c.detail}`).join("\n"),
    meta: { verdict: result.verdict, distanceM: result.distanceM } as Prisma.InputJsonValue,
  });
  await db.lead.update({ where: { id: appt.leadId }, data: { lastContactAt: new Date() } });
  return { appointment: updated, validation: result };
}

export async function checkOut(session: Session, appointmentId: string, outcome: string | null, itemsGiven: string[] = []) {
  const appt = await db.appointment.findFirst({ where: { id: appointmentId, organizationId: session.orgId } });
  if (!appt) throw new ApiError(404, "Appointment not found");
  if (appt.assignedToId !== session.userId && !can(session.role, "quotations:review"))
    throw new ApiError(403, "Only the assigned salesperson can complete this visit");
  const updated = await db.appointment.update({
    where: { id: appt.id },
    data: { status: "COMPLETED", checkOutAt: new Date(), outcome, itemsGiven: itemsGiven.length ? itemsGiven : undefined },
  });
  await logActivity({
    orgId: session.orgId,
    leadId: appt.leadId,
    userId: session.userId,
    type: "APPOINTMENT",
    title: `${humanize(appt.type)} completed`,
    body: [outcome, itemsGiven.length ? `Given to customer: ${itemsGiven.join(", ")}` : null].filter(Boolean).join("\n"),
  });
  if (appt.type === "SITE_VISIT") await advanceStage(appt.leadId, "SITE_VISIT_DONE", session.userId);
  return updated;
}

// ─── Quotations ──────────────────────────────────────────────────────────

const quoteFormSchema = z.object({
  sizeMode: z.enum(["eb", "direct"]),
  bimonthlyUnits: z.number().positive().max(10_000_000).nullable().optional(),
  bimonthlyBill: z.number().positive().max(100_000_000).nullable().optional(),
  directKw: z.number().positive().max(10_000).nullable().optional(),
  structure: z.enum(["lowrise", "highrise"]),
  floors: z.number().int().min(1).max(30).nullable().optional(),
  dcCableSize: z.string().trim().min(1).max(10),
  acCableSize: z.string().trim().min(1).max(10),
  systemType: z.enum(["dcr", "ndcr", "hybrid", "micro"]),
  panelType: z.enum(["bifacial", "topcon", "hjt"]),
  panelWatt: z.number().int().min(100).max(1000).nullable().optional(),
  panelBrand: z.string().trim().max(60).nullable().optional(),
  inverterBrand: z.string().trim().max(60).nullable().optional(),
  inverterPhase: z.enum(["single", "three"]),
  inverterKw: z.number().min(0).max(10_000).nullable().optional(),
  overrideTotal: z.number().min(1000).max(100_000_000).nullable().optional(),
});

/** Customer Details card — printed on the cover letter, and used to create the lead when there is none. */
const quoteCustomerSchema = z.object({
  name: z.string().trim().min(2, "Customer name is required").max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Mobile number must be 10 digits."),
  address: z.string().trim().max(300).default(""),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "PIN code must be 6 digits."),
  ebNumber: z.string().trim().max(30).default(""),
});
type QuoteCustomer = z.infer<typeof quoteCustomerSchema>;

export const quotationInputSchema = z.object({
  /** Omit to create the lead from the customer details. */
  leadId: z.string().min(1).optional(),
  customer: quoteCustomerSchema,
  appointmentId: z.string().nullable().optional(),
  mode: z.enum(["FIELD", "OFFICE"]),
  quote: quoteFormSchema,
  capture: captureSchema.optional(),
  deviceInfo: z.string().max(300).nullable().optional(),
});
export type QuotationInput = z.infer<typeof quotationInputSchema>;

const STRUCTURE_LABEL = { lowrise: "Ground Mount GI", highrise: "Elevated GI HDP" } as const;

/**
 * Prices a quotation with the quotation engine and maps it onto the Quotation row. `base` pins
 * the price sheet (a revision re-prices with the sheet its original was made with).
 */
function priceQuotation(
  s: OrgSettings,
  companyName: string,
  input: QuotifyInput,
  customer: QuoteCustomer,
  base?: Pick<QuotifySnapshot, "prices" | "custom" | "stateSubsidy" | "paymentStages">,
) {
  const cfg = quotationConfig(s);
  const prices = base?.prices ?? cfg.P;
  const custom = base?.custom ?? cfg.custom;
  const stateSubsidy = base?.stateSubsidy ?? cfg.stateSubsidy;
  let r;
  try {
    r = computeQuotify(input, prices, custom, { stateSubsidy, companyName });
  } catch (e) {
    if (e instanceof QuotifyInputError) throw new ApiError(400, e.message);
    throw e;
  }
  const snapshot: QuotifySnapshot = {
    v: 1,
    input,
    prices,
    custom,
    stateSubsidy,
    paymentStages: base?.paymentStages ?? s.quotation.paymentStages,
    customer,
    result: r,
  };
  let savings25 = 0;
  for (let y = 0, ys = r.savings.annualSave; y < 25; y++, ys *= 1.06) savings25 += ys;
  const columns = {
    systemKw: r.actualKw,
    panelBrand: r.brands.panel,
    panelWattage: r.panelWatt,
    panelCount: r.panels,
    panelType: PANEL_TECH_LABEL[input.panelType],
    inverterBrand: r.brands.inverter,
    inverterKw: r.inverterKw,
    inverterType: r.sysLabel,
    structureType: STRUCTURE_LABEL[input.structure],
    lineItems: r.rows.map((x) => ({ name: x.content, spec: x.desc, make: x.make, qty: x.qty, unit: x.uom, rate: x.unit, amount: Math.round(x.sub) })) as unknown as Prisma.InputJsonValue,
    quoteData: snapshot as unknown as Prisma.InputJsonValue,
    subtotal: Math.round(r.preTax),
    discount: 0,
    marginAmount: r.margin,
    manualOverride: r.overridden,
    gstRate: r.blendPct,
    gstAmount: Math.round(r.gst),
    totalAmount: Math.round(r.grandTotal),
    subsidyAmount: r.subsidy,
    netCost: Math.round(r.netCost),
    loanAmount: null,
    loanRate: null,
    loanTenureMonths: null,
    emi: null,
    annualGenerationKwh: Math.round(r.savings.annualUnits),
    annualSavings: Math.round(r.savings.annualSave),
    paybackYears: Math.round(r.savings.paybackYrs * 100) / 100,
    savings25Years: Math.round(savings25),
    co2TonnesPerYear: Math.round(((r.savings.annualUnits * s.gridEmissionFactor) / 1000) * 100) / 100,
  };
  return { r, columns };
}

export async function createQuotation(session: Session, input: QuotationInput) {
  if (input.mode === "OFFICE" && !can(session.role, "quotations:review"))
    throw new ApiError(403, "Field sales must create quotations on-site with GPS. Office quotations need manager rights.");

  const org = await db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { name: true, settings: true } });
  const s = parseSettings(org.settings);
  const c = input.customer;
  const q = input.quote as QuotifyInput;
  // Price first, so a bad form never creates a lead.
  const { r, columns } = priceQuotation(s, org.name, q, c);

  let lead: Lead;
  let leadCreated = false;
  let leadDuplicate = false;
  if (input.leadId) {
    lead = await getLeadForSession(session, input.leadId);
    // Fill in what the lead was missing from the Customer Details card.
    const fill: Prisma.LeadUpdateInput = {};
    if (!lead.address && c.address) fill.address = c.address;
    if (!lead.pincode && c.pincode) fill.pincode = c.pincode;
    if (!lead.consumerNumber && c.ebNumber) fill.consumerNumber = c.ebNumber;
    if (Object.keys(fill).length) lead = await db.lead.update({ where: { id: lead.id }, data: fill });
  } else {
    const created = await createLead(
      session.orgId,
      leadCreateSchema.parse({
        name: c.name,
        phone: c.phone,
        address: c.address || null,
        pincode: c.pincode,
        consumerNumber: c.ebNumber || null,
        source: "WALK_IN",
        segment: "RESIDENTIAL",
        phase: q.inverterPhase === "three" ? "THREE" : "SINGLE",
        monthlyUnits: r.monthlyGridUnits ? Math.round(r.monthlyGridUnits) : null,
        monthlyBill: q.sizeMode === "eb" && q.bimonthlyBill ? Math.round(q.bimonthlyBill / 2) : null,
      }),
      session.userId,
    );
    lead = created.lead;
    leadCreated = !created.duplicate;
    leadDuplicate = created.duplicate;
  }

  let appointment: { id: string; startAt: Date; endAt: Date } | null = null;
  if (input.appointmentId) {
    appointment = await db.appointment.findFirst({
      where: { id: input.appointmentId, organizationId: session.orgId, leadId: lead.id },
      select: { id: true, startAt: true, endAt: true },
    });
    if (!appointment) throw new ApiError(400, "Appointment does not belong to this lead");
  } else if (input.mode === "FIELD") {
    // Auto-link today's appointment for this lead and salesperson.
    const dayStart = new Date(Date.now() - 12 * 3_600_000);
    const dayEnd = new Date(Date.now() + 12 * 3_600_000);
    appointment = await db.appointment.findFirst({
      where: { organizationId: session.orgId, leadId: lead.id, assignedToId: session.userId, startAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } },
      orderBy: { startAt: "asc" },
      select: { id: true, startAt: true, endAt: true },
    });
  }

  let geoVerdict: GeoVerdict = "OFFICE_CREATED";
  let validation: ValidationResult | null = null;
  const capture = input.capture ?? null;
  if (input.mode === "FIELD") {
    validation = await validate(session, s, lead, capture, appointment);
    geoVerdict = validation.verdict;
  }

  const quotation = await db.quotation.create({
    data: {
      organizationId: session.orgId,
      number: await nextQuotationNumber(session.orgId),
      leadId: lead.id,
      createdById: session.userId,
      appointmentId: appointment?.id ?? null,
      ...columns,
      validUntil: new Date(Date.now() + s.quotationValidityDays * 86_400_000),
      notes: null,
      terms: null,
      capturedLat: capture?.lat ?? null,
      capturedLng: capture?.lng ?? null,
      capturedAccuracyM: capture?.accuracyM ?? null,
      deviceTime: capture?.deviceTime ?? null,
      distanceFromSiteM: validation?.distanceM ?? null,
      geoVerdict,
      geoFlags: validation ? ({ flags: validation.flags, checks: validation.checks } as unknown as Prisma.InputJsonValue) : undefined,
      deviceInfo: input.deviceInfo ?? null,
    },
  });

  if (capture) {
    await db.locationPing.create({
      data: {
        organizationId: session.orgId,
        userId: session.userId,
        lat: capture.lat,
        lng: capture.lng,
        accuracyM: capture.accuracyM ?? null,
        deviceTime: capture.deviceTime ?? null,
        source: "QUOTATION",
        refId: quotation.id,
      },
    });
  }

  await db.lead.update({
    where: { id: lead.id },
    data: { recommendedKw: r.actualKw, estimatedCost: Math.round(r.grandTotal), subsidyAmount: r.subsidy, lastContactAt: new Date() },
  });
  await logActivity({
    orgId: session.orgId,
    leadId: lead.id,
    userId: session.userId,
    type: "QUOTATION",
    title: `Quotation ${quotation.number} · ${r.actualKw} kW ${r.sysLabel} · ${formatINR(r.netCost)} net`,
    body: validation ? `Location check: ${humanize(validation.verdict)}${validation.distanceM != null ? ` (${validation.distanceM} m from site)` : ""}` : "Created from office",
    meta: { quotationId: quotation.id, verdict: geoVerdict } as Prisma.InputJsonValue,
  });

  if (input.mode === "FIELD" && geoVerdict !== "VERIFIED") {
    await fireTrigger("QUOTATION_FLAGGED", {
      orgId: session.orgId,
      leadId: lead.id,
      refKey: `qflag:${quotation.id}`,
      extra: { href: `/tracking?quote=${quotation.id}` },
    });
  }
  return {
    quotation,
    validation,
    lead: { id: lead.id, name: lead.name, code: lead.code },
    leadCreated,
    leadDuplicate,
  };
}

export const reviseQuotationSchema = z.object({
  discount: z.number().min(0).optional(),
  manualTotalOverride: z.number().positive().max(100_000_000).nullable().optional(),
  panelBrand: z.string().min(1).max(60).optional(),
  inverterBrand: z.string().min(1).max(60).optional(),
  structureType: z.string().max(120).optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type ReviseQuotationInput = z.infer<typeof reviseQuotationSchema>;

/**
 * Non-destructive revision: the system design is kept as-is (resizing is a new quotation, not a
 * revision) but price terms — a manual final price, brands, notes (and a discount on older
 * quotations) — can change. The original row is marked superseded and kept forever as the exact
 * snapshot it was sent/reviewed as; the new row keeps the same quote number with `version` bumped
 * and `parentId` pointing at the lineage's original root quotation.
 */
export async function reviseQuotation(session: Session, quotationId: string, input: ReviseQuotationInput) {
  const prior = await db.quotation.findFirst({ where: { id: quotationId, organizationId: session.orgId }, include: { lead: true } });
  if (!prior) throw new ApiError(404, "Quotation not found");
  const isOwner = prior.createdById === session.userId || prior.lead.assignedToId === session.userId;
  if (!isOwner && !can(session.role, "quotations:review")) throw new ApiError(403, "Not your quotation");

  const rootId = prior.parentId ?? prior.id;
  const latest = await db.quotation.aggregate({ where: { organizationId: session.orgId, OR: [{ id: rootId }, { parentId: rootId }] }, _max: { version: true } });
  const nextVersion = (latest._max.version ?? prior.version) + 1;

  const org = await db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { name: true, settings: true } });
  const s = parseSettings(org.settings);
  const lead = prior.lead;

  let priced: Omit<Prisma.QuotationUncheckedCreateInput, "organizationId" | "number" | "leadId" | "createdById" | "validUntil">;
  let netCost: number;
  if (isQuotifySnapshot(prior.quoteData)) {
    const snap = prior.quoteData;
    const quote: QuotifyInput = {
      ...snap.input,
      overrideTotal: input.manualTotalOverride !== undefined ? input.manualTotalOverride : snap.input.overrideTotal,
      panelBrand: input.panelBrand ?? snap.input.panelBrand,
      inverterBrand: input.inverterBrand ?? snap.input.inverterBrand,
    };
    const { r, columns } = priceQuotation(s, org.name, quote, snap.customer, snap);
    priced = columns;
    netCost = r.netCost;
  } else {
    const panelBrand = input.panelBrand ?? prior.panelBrand;
    const inverterBrand = input.inverterBrand ?? prior.inverterBrand;
    const structureType = input.structureType ?? prior.structureType;
    const sz = sizeSystem(
      {
        monthlyBill: lead.monthlyBill,
        monthlyUnits: lead.monthlyUnits,
        segment: lead.segment,
        sanctionedLoadKw: lead.sanctionedLoadKw,
        phase: lead.phase,
        overrideKw: prior.systemKw, // a revision keeps the same system size
        panelWattage: prior.panelWattage,
        discount: input.discount ?? prior.discount,
        manualTotalOverride: input.manualTotalOverride !== undefined ? input.manualTotalOverride : prior.manualOverride ? prior.totalAmount : null,
      },
      s,
    );
    const loan = prior.loanAmount
      ? loanPlan(sz.netCost, sz.monthlySavings, prior.loanRate ?? s.loanRatePct, prior.loanTenureMonths ?? s.loanTenureMonths, 0)
      : null;
    priced = {
      systemKw: sz.recommendedKw,
      panelBrand,
      panelWattage: prior.panelWattage,
      panelCount: sz.panelCount,
      inverterBrand,
      inverterKw: sz.inverterKw,
      structureType,
      lineItems: buildLineItems(sz, { panelBrand, panelWattage: prior.panelWattage, inverterBrand, structureType, phase: lead.phase }, s) as unknown as Prisma.InputJsonValue,
      subtotal: sz.subtotal,
      discount: sz.discount,
      marginAmount: sz.margin,
      manualOverride: sz.manualOverride,
      gstRate: s.gstRate,
      gstAmount: sz.gstAmount,
      totalAmount: sz.totalCost,
      subsidyAmount: sz.subsidy,
      netCost: sz.netCost,
      loanAmount: loan?.loanAmount ?? null,
      loanRate: loan?.ratePct ?? null,
      loanTenureMonths: loan?.tenureMonths ?? null,
      emi: loan?.emi ?? null,
      annualGenerationKwh: sz.annualGenerationKwh,
      annualSavings: sz.annualSavings,
      paybackYears: sz.paybackYears,
      savings25Years: sz.savings25Years,
      co2TonnesPerYear: sz.co2TonnesPerYear,
    };
    netCost = sz.netCost;
  }

  const [, revision] = await db.$transaction([
    db.quotation.updateMany({ where: { organizationId: session.orgId, OR: [{ id: rootId }, { parentId: rootId }], supersededAt: null }, data: { supersededAt: new Date() } }),
    db.quotation.create({
      data: {
        ...priced,
        organizationId: session.orgId,
        number: prior.number,
        version: nextVersion,
        parentId: rootId,
        leadId: prior.leadId,
        createdById: session.userId,
        appointmentId: prior.appointmentId,
        status: "DRAFT",
        validUntil: new Date(Date.now() + s.quotationValidityDays * 86_400_000),
        notes: input.notes !== undefined ? input.notes : prior.notes,
        terms: prior.terms,
        // Revising edits price terms from the office — it isn't a new site visit, so the
        // original GPS/time evidence carries over as-is rather than being re-validated.
        capturedLat: prior.capturedLat,
        capturedLng: prior.capturedLng,
        capturedAccuracyM: prior.capturedAccuracyM,
        deviceTime: prior.deviceTime,
        distanceFromSiteM: prior.distanceFromSiteM,
        geoVerdict: prior.geoVerdict,
        geoFlags: prior.geoFlags as Prisma.InputJsonValue | undefined,
        deviceInfo: prior.deviceInfo,
      },
    }),
  ]);

  await logActivity({
    orgId: session.orgId,
    leadId: prior.leadId,
    userId: session.userId,
    type: "QUOTATION",
    title: `Quotation ${prior.number} revised to R${nextVersion} · ${formatINR(netCost)} net`,
    meta: { quotationId: revision.id, priorId: prior.id } as Prisma.InputJsonValue,
  });

  return { quotation: revision };
}

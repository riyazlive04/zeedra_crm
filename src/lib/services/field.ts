import "server-only";
import type { GeoVerdict, Lead, LeadStage, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { parseSettings, type OrgSettings } from "../settings";
import { validateFieldCapture, type FieldCapture, type ValidationResult } from "../geo";
import { sizeSystem, type SizingResult } from "../solar/sizing";
import { loanPlan } from "../solar/finance";
import { nextQuotationNumber } from "../counter";
import { logActivity } from "../activity";
import { fireTrigger } from "../automation/engine";
import { ApiError } from "../errors";
import { can } from "../rbac";
import type { Session } from "../session";
import { getLeadForSession, onStageChanged, createLead } from "./leads";
import { formatINR, humanize } from "../text";
import { buildLineItems, DEFAULT_TERMS } from "../solar/quote";
import { leadContactSchema, basicQualSchema } from "../validators";

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

/** Minimal customer intake collected right inside the quote builder when there is no lead yet. */
export const quickLeadSchema = leadContactSchema.merge(
  basicQualSchema.pick({ monthlyBill: true, monthlyUnits: true, roofAreaSqft: true, sanctionedLoadKw: true, phase: true }),
);

export const quotationInputSchema = z
  .object({
    leadId: z.string().min(1).optional(),
    newLead: quickLeadSchema.optional(),
    appointmentId: z.string().nullable().optional(),
    mode: z.enum(["FIELD", "OFFICE"]),
    systemKw: z.number().positive().max(10000).nullable().optional(),
    panelBrand: z.string().min(1).max(60),
    panelWattage: z.number().int().min(100).max(800),
    inverterBrand: z.string().min(1).max(60),
    structureType: z.string().max(120).optional(),
    discount: z.number().min(0).default(0),
    manualTotalOverride: z.number().positive().max(100_000_000).nullable().optional(),
    loan: z
      .object({ enabled: z.boolean(), tenureMonths: z.number().int().min(6).max(240), ratePct: z.number().min(0).max(30), downPaymentPct: z.number().min(0).max(100) })
      .optional(),
    notes: z.string().max(2000).nullable().optional(),
    capture: captureSchema.optional(),
    deviceInfo: z.string().max(300).nullable().optional(),
  })
  .refine((d) => Boolean(d.leadId) !== Boolean(d.newLead), { message: "Provide either an existing lead or a new customer's details, not both", path: ["leadId"] });
export type QuotationInput = z.infer<typeof quotationInputSchema>;

export async function createQuotation(session: Session, input: QuotationInput) {
  if (input.mode === "OFFICE" && !can(session.role, "quotations:review"))
    throw new ApiError(403, "Field sales must create quotations on-site with GPS. Office quotations need manager rights.");

  let lead: Lead;
  let leadCreated = false;
  let leadDuplicate = false;
  if (input.leadId) {
    lead = await getLeadForSession(session, input.leadId);
  } else if (input.newLead) {
    const created = await createLead(session.orgId, input.newLead, session.userId);
    lead = created.lead;
    leadCreated = !created.duplicate;
    leadDuplicate = created.duplicate;
  } else {
    throw new ApiError(400, "Provide either an existing lead or a new customer's details");
  }

  const org = await db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { settings: true } });
  const s = parseSettings(org.settings);

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

  const sz = sizeSystem(
    {
      monthlyBill: lead.monthlyBill,
      monthlyUnits: lead.monthlyUnits,
      segment: lead.segment,
      roofAreaSqft: input.systemKw ? null : lead.roofAreaSqft,
      sanctionedLoadKw: lead.sanctionedLoadKw,
      phase: lead.phase,
      overrideKw: input.systemKw ?? null,
      panelWattage: input.panelWattage,
      discount: input.discount,
      manualTotalOverride: input.manualTotalOverride ?? null,
    },
    s,
  );
  if (!sz.monthlyUnits && !input.systemKw) throw new ApiError(400, "Capture the electricity bill/units or enter a system size first");

  let geoVerdict: GeoVerdict = "OFFICE_CREATED";
  let validation: ValidationResult | null = null;
  const capture = input.capture ?? null;
  if (input.mode === "FIELD") {
    validation = await validate(session, s, lead, capture, appointment);
    geoVerdict = validation.verdict;
  }

  const loan = input.loan?.enabled
    ? loanPlan(sz.netCost, sz.monthlySavings, input.loan.ratePct, input.loan.tenureMonths, input.loan.downPaymentPct)
    : null;

  const quotation = await db.quotation.create({
    data: {
      organizationId: session.orgId,
      number: await nextQuotationNumber(session.orgId),
      leadId: lead.id,
      createdById: session.userId,
      appointmentId: appointment?.id ?? null,
      systemKw: sz.recommendedKw,
      panelBrand: input.panelBrand,
      panelWattage: input.panelWattage,
      panelCount: sz.panelCount,
      inverterBrand: input.inverterBrand,
      inverterKw: sz.inverterKw,
      structureType: input.structureType || "Hot-dip galvanised elevated",
      lineItems: buildLineItems(sz, { ...input, phase: lead.phase }, s) as unknown as Prisma.InputJsonValue,
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
      validUntil: new Date(Date.now() + s.quotationValidityDays * 86_400_000),
      notes: input.notes ?? null,
      terms: DEFAULT_TERMS,
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
    data: { recommendedKw: sz.recommendedKw, estimatedCost: sz.totalCost, subsidyAmount: sz.subsidy, lastContactAt: new Date() },
  });
  await logActivity({
    orgId: session.orgId,
    leadId: lead.id,
    userId: session.userId,
    type: "QUOTATION",
    title: `Quotation ${quotation.number} · ${sz.recommendedKw} kW · ${formatINR(sz.netCost)} net`,
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
    sizing: sz,
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
 * Non-destructive revision: the system size is kept as-is (resizing is a new quotation, not a
 * revision) but price terms — discount, a manual override, brands, structure, notes — can
 * change. The original row is marked superseded and kept forever as the exact snapshot it was
 * sent/reviewed as; the new row keeps the same quote number with `version` bumped and `parentId`
 * pointing at the lineage's original root quotation.
 */
export async function reviseQuotation(session: Session, quotationId: string, input: ReviseQuotationInput) {
  const prior = await db.quotation.findFirst({ where: { id: quotationId, organizationId: session.orgId }, include: { lead: true } });
  if (!prior) throw new ApiError(404, "Quotation not found");
  const isOwner = prior.createdById === session.userId || prior.lead.assignedToId === session.userId;
  if (!isOwner && !can(session.role, "quotations:review")) throw new ApiError(403, "Not your quotation");

  const rootId = prior.parentId ?? prior.id;
  const latest = await db.quotation.aggregate({ where: { organizationId: session.orgId, OR: [{ id: rootId }, { parentId: rootId }] }, _max: { version: true } });
  const nextVersion = (latest._max.version ?? prior.version) + 1;

  const org = await db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { settings: true } });
  const s = parseSettings(org.settings);
  const lead = prior.lead;

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

  const [, revision] = await db.$transaction([
    db.quotation.updateMany({ where: { organizationId: session.orgId, OR: [{ id: rootId }, { parentId: rootId }], supersededAt: null }, data: { supersededAt: new Date() } }),
    db.quotation.create({
      data: {
        organizationId: session.orgId,
        number: prior.number,
        version: nextVersion,
        parentId: rootId,
        leadId: prior.leadId,
        createdById: session.userId,
        appointmentId: prior.appointmentId,
        status: "DRAFT",
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
    title: `Quotation ${prior.number} revised to R${nextVersion} · ${formatINR(sz.netCost)} net`,
    meta: { quotationId: revision.id, priorId: prior.id } as Prisma.InputJsonValue,
  });

  return { quotation: revision, sizing: sz };
}

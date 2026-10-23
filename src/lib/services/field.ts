import "server-only";
import type { GeoVerdict, LeadStage, Prisma } from "@prisma/client";
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
import { getLeadForSession, onStageChanged } from "./leads";
import { formatINR, humanize } from "../text";
import { buildLineItems, DEFAULT_TERMS } from "../solar/quote";

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

export const quotationInputSchema = z.object({
  leadId: z.string().min(1),
  appointmentId: z.string().nullable().optional(),
  mode: z.enum(["FIELD", "OFFICE"]),
  systemKw: z.number().positive().max(10000).nullable().optional(),
  panelBrand: z.string().min(1).max(60),
  panelWattage: z.number().int().min(100).max(800),
  inverterBrand: z.string().min(1).max(60),
  structureType: z.string().max(120).optional(),
  discount: z.number().min(0).default(0),
  loan: z
    .object({ enabled: z.boolean(), tenureMonths: z.number().int().min(6).max(240), ratePct: z.number().min(0).max(30), downPaymentPct: z.number().min(0).max(100) })
    .optional(),
  notes: z.string().max(2000).nullable().optional(),
  capture: captureSchema.optional(),
  deviceInfo: z.string().max(300).nullable().optional(),
});
export type QuotationInput = z.infer<typeof quotationInputSchema>;

export async function createQuotation(session: Session, input: QuotationInput) {
  const lead = await getLeadForSession(session, input.leadId);
  const org = await db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { settings: true } });
  const s = parseSettings(org.settings);

  if (input.mode === "OFFICE" && !can(session.role, "quotations:review"))
    throw new ApiError(403, "Field sales must create quotations on-site with GPS. Office quotations need manager rights.");

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
      lineItems: buildLineItems(sz, input, s.bomRates) as unknown as Prisma.InputJsonValue,
      subtotal: sz.subtotal,
      discount: sz.discount,
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
  return { quotation, validation, sizing: sz };
}

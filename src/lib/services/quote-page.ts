import "server-only";
import { notFound } from "next/navigation";
import { db } from "../db";
import type { Session } from "../session";
import { leadScope } from "./leads";

/** Loads what the quote builder needs, including today's appointment for this salesperson. */
export async function loadQuoteContext(session: Session, leadId: string) {
  const lead = await db.lead.findFirst({
    where: { id: leadId, ...leadScope(session) },
    select: {
      id: true, name: true, code: true, segment: true, monthlyBill: true, monthlyUnits: true, roofAreaSqft: true, sanctionedLoadKw: true,
      phase: true, lat: true, lng: true, sitePinned: true, paymentMode: true,
    },
  });
  if (!lead) notFound();
  const now = Date.now();
  const appt = await db.appointment.findFirst({
    where: {
      organizationId: session.orgId,
      leadId,
      status: { in: ["SCHEDULED", "CHECKED_IN", "COMPLETED"] },
      startAt: { gte: new Date(now - 12 * 3_600_000), lte: new Date(now + 12 * 3_600_000) },
    },
    orderBy: { startAt: "asc" },
    select: { id: true, startAt: true, endAt: true },
  });
  return {
    lead,
    appointment: appt ? { id: appt.id, startAt: appt.startAt.toISOString(), endAt: appt.endAt.toISOString() } : null,
  };
}

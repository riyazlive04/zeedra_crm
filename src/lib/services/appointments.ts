import "server-only";
import type { Appointment, AppointmentType } from "@prisma/client";
import { z } from "zod";
import { format } from "date-fns";
import { db } from "../db";
import { parseSettings } from "../settings";
import { computeSlots } from "../scheduling";
import { createCalendarEvent, deleteCalendarEvent, googleBusy, updateCalendarEvent } from "../google-calendar";
import { logActivity, notify } from "../activity";
import { fireTrigger } from "../automation/engine";
import { ApiError } from "../errors";
import { can } from "../rbac";
import type { Session } from "../session";
import { getLeadForSession } from "./leads";
import { advanceStage } from "./field";
import { displayPhone, formatINR, humanize } from "../text";
import { APPT_TYPES } from "../validators";
import { BRAND } from "../brand";

export const appointmentInputSchema = z.object({
  leadId: z.string().min(1),
  assignedToId: z.string().min(1),
  type: z.enum(APPT_TYPES),
  startAt: z.coerce.date(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

async function busyIntervals(orgId: string, userId: string, from: Date, to: Date, excludeId?: string) {
  const local = await db.appointment.findMany({
    where: {
      organizationId: orgId,
      assignedToId: userId,
      status: { in: ["SCHEDULED", "CHECKED_IN"] },
      startAt: { lt: to },
      endAt: { gt: from },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { startAt: true, endAt: true, googleEventId: true },
  });
  const google = await googleBusy(userId, from, to).catch(() => []);
  return [...local.map((a) => ({ start: a.startAt, end: a.endAt })), ...google];
}

export async function availableSlots(session: Session, userId: string, date: string) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { settings: true } });
  const s = parseSettings(org.settings);
  const dayFrom = new Date(`${date}T00:00:00Z`);
  const from = new Date(dayFrom.getTime() - 86_400_000);
  const to = new Date(dayFrom.getTime() + 2 * 86_400_000);
  const busy = await busyIntervals(session.orgId, userId, from, to);
  return computeSlots({
    date,
    tz: s.timezone,
    workdayStart: s.workdayStart,
    workdayEnd: s.workdayEnd,
    slotMinutes: s.slotMinutes,
    workdays: s.workdays,
    busy,
    bufferMinutes: 15,
  });
}

function calendarPayload(appt: Appointment, lead: { name: string; phone: string; code: string; address: string | null; city: string | null; recommendedKw: number | null; monthlyBill: number | null; email: string | null }, tz: string) {
  const mapLink = lead.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.address} ${lead.city ?? ""}`)}` : "";
  return {
    summary: `☀ ${humanize(appt.type)} — ${lead.name}`,
    description: [
      `Lead: ${lead.name} (${lead.code})`,
      `Phone: ${displayPhone(lead.phone)}`,
      lead.monthlyBill ? `EB bill: ${formatINR(lead.monthlyBill)}/month` : "",
      lead.recommendedKw ? `Recommended system: ${lead.recommendedKw} kW` : "",
      appt.notes ? `Notes: ${appt.notes}` : "",
      mapLink ? `Directions: ${mapLink}` : "",
      `Open in ${BRAND.product}: ${process.env.APP_URL ?? ""}/leads/${appt.leadId}`,
    ]
      .filter(Boolean)
      .join("\n"),
    location: appt.address ?? [lead.address, lead.city].filter(Boolean).join(", "),
    start: appt.startAt,
    end: appt.endAt,
    attendeeEmail: appt.type === "INSTALLATION" ? null : lead.email,
    timezone: tz,
  };
}

export async function bookAppointment(session: Session, input: z.infer<typeof appointmentInputSchema>) {
  const lead = await getLeadForSession(session, input.leadId);
  const assignee = await db.user.findFirst({ where: { id: input.assignedToId, organizationId: session.orgId, active: true } });
  if (!assignee) throw new ApiError(400, "Selected salesperson not found");
  if (session.role === "FIELD_SALES" && assignee.id !== session.userId) throw new ApiError(403, "You can only book visits for yourself");

  const startAt = input.startAt;
  const endAt = new Date(startAt.getTime() + input.durationMinutes * 60_000);
  if (startAt.getTime() < Date.now() - 5 * 60_000) throw new ApiError(400, "Appointment time is in the past");

  const clash = await db.appointment.findFirst({
    where: {
      organizationId: session.orgId,
      assignedToId: assignee.id,
      status: { in: ["SCHEDULED", "CHECKED_IN"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    include: { lead: { select: { name: true } } },
  });
  if (clash) throw new ApiError(409, `${assignee.name} already has a visit with ${clash.lead.name} at ${format(clash.startAt, "h:mm a")}`);

  const org = await db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { settings: true } });
  const s = parseSettings(org.settings);

  let appt = await db.appointment.create({
    data: {
      organizationId: session.orgId,
      leadId: lead.id,
      assignedToId: assignee.id,
      type: input.type,
      startAt,
      endAt,
      address: input.address ?? ([lead.address, lead.city].filter(Boolean).join(", ") || null),
      notes: input.notes ?? null,
    },
  });

  try {
    const eventId = await createCalendarEvent(assignee.id, calendarPayload(appt, lead, s.timezone));
    if (eventId) appt = await db.appointment.update({ where: { id: appt.id }, data: { googleEventId: eventId } });
  } catch (e) {
    appt = await db.appointment.update({
      where: { id: appt.id },
      data: { googleSyncError: e instanceof Error ? e.message : "Google sync failed" },
    });
  }

  // Field visits hand the lead to the field salesperson.
  if (input.type === "SITE_VISIT" && lead.assignedToId !== assignee.id && assignee.role === "FIELD_SALES") {
    await db.lead.update({ where: { id: lead.id }, data: { assignedToId: assignee.id } });
    await logActivity({ orgId: session.orgId, leadId: lead.id, userId: session.userId, type: "ASSIGNMENT", title: `Assigned to ${assignee.name} for site visit` });
  }
  await db.lead.update({ where: { id: lead.id }, data: { lastContactAt: new Date(), nextFollowUpAt: startAt } });
  await logActivity({
    orgId: session.orgId,
    leadId: lead.id,
    userId: session.userId,
    type: "APPOINTMENT",
    title: `${humanize(input.type)} booked for ${format(startAt, "EEE d MMM, h:mm a")} with ${assignee.name}`,
    body: appt.googleEventId ? "Synced to Google Calendar" : appt.googleSyncError ? `Google Calendar: ${appt.googleSyncError}` : null,
  });
  if (assignee.id !== session.userId)
    await notify(session.orgId, assignee.id, `New ${humanize(input.type).toLowerCase()} booked`, `${lead.name} · ${format(startAt, "EEE d MMM, h:mm a")}`, `/field`);
  if (input.type === "SITE_VISIT") await advanceStage(lead.id, "SITE_VISIT_SCHEDULED", session.userId);

  await fireTrigger("APPOINTMENT_BOOKED", {
    orgId: session.orgId,
    leadId: lead.id,
    refKey: `booked:${appt.id}`,
    extra: { appointmentType: input.type },
    vars: { date: format(startAt, "EEE, d MMM"), time: format(startAt, "h:mm a"), salesperson: assignee.name, salespersonPhone: assignee.phone ?? "" },
  });
  return appt;
}

export async function updateAppointment(
  session: Session,
  id: string,
  patch: { status?: "CANCELLED" | "NO_SHOW" | "SCHEDULED"; startAt?: Date; durationMinutes?: number; notes?: string | null; assignedToId?: string; type?: AppointmentType },
) {
  const appt = await db.appointment.findFirst({ where: { id, organizationId: session.orgId }, include: { lead: true } });
  if (!appt) throw new ApiError(404, "Appointment not found");
  if (appt.assignedToId !== session.userId && !can(session.role, "leads:assign")) throw new ApiError(403, "Not your appointment");

  const startAt = patch.startAt ?? appt.startAt;
  const duration = patch.durationMinutes ?? (appt.endAt.getTime() - appt.startAt.getTime()) / 60_000;
  const endAt = new Date(startAt.getTime() + duration * 60_000);
  const assignedToId = patch.assignedToId ?? appt.assignedToId;

  if (patch.startAt || patch.assignedToId) {
    const clash = await db.appointment.findFirst({
      where: { organizationId: session.orgId, assignedToId, id: { not: id }, status: { in: ["SCHEDULED", "CHECKED_IN"] }, startAt: { lt: endAt }, endAt: { gt: startAt } },
    });
    if (clash) throw new ApiError(409, "That slot clashes with another appointment");
  }

  const updated = await db.appointment.update({
    where: { id },
    data: { status: patch.status ?? appt.status, startAt, endAt, notes: patch.notes ?? appt.notes, assignedToId, type: patch.type ?? appt.type },
  });

  const org = await db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { settings: true } });
  const s = parseSettings(org.settings);
  try {
    if (appt.googleEventId) {
      if (patch.status === "CANCELLED" || assignedToId !== appt.assignedToId) await deleteCalendarEvent(appt.assignedToId, appt.googleEventId);
      else await updateCalendarEvent(appt.assignedToId, appt.googleEventId, calendarPayload(updated, appt.lead, s.timezone));
    }
    if (patch.status !== "CANCELLED" && assignedToId !== appt.assignedToId) {
      const eventId = await createCalendarEvent(assignedToId, calendarPayload(updated, appt.lead, s.timezone));
      await db.appointment.update({ where: { id }, data: { googleEventId: eventId } });
    }
  } catch (e) {
    await db.appointment.update({ where: { id }, data: { googleSyncError: e instanceof Error ? e.message : "Google sync failed" } });
  }

  const what = patch.status === "CANCELLED" ? "cancelled" : patch.status === "NO_SHOW" ? "marked no-show" : "rescheduled";
  await logActivity({
    orgId: session.orgId,
    leadId: appt.leadId,
    userId: session.userId,
    type: "APPOINTMENT",
    title: `${humanize(appt.type)} ${what}${what === "rescheduled" ? ` to ${format(startAt, "EEE d MMM, h:mm a")}` : ""}`,
  });
  return updated;
}

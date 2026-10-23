import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { leadUpdateSchema } from "@/lib/validators";
import { getLeadForSession, requalify } from "@/lib/services/leads";
import { normalizePhone } from "@/lib/text";
import { ApiError } from "@/lib/errors";
import { audit, logActivity } from "@/lib/activity";
import { can } from "@/lib/rbac";

type P = { id: string };

export const GET = route<P>(null, async ({ session, params }) => {
  const lead = await getLeadForSession(session, params.id);
  return db.lead.findUniqueOrThrow({
    where: { id: lead.id },
    include: {
      assignedTo: { select: { id: true, name: true, avatarColor: true, phone: true } },
      appointments: { orderBy: { startAt: "desc" }, include: { assignedTo: { select: { name: true } } } },
      quotations: { orderBy: { createdAt: "desc" } },
      project: true,
    },
  });
});

const QUAL_FIELDS = new Set([
  "monthlyBill", "monthlyUnits", "sanctionedLoadKw", "phase", "ownsProperty", "roofType", "roofAreaSqft", "shadowFree", "segment",
  "siteVisitReady", "installationTimeline", "paymentMode", "budgetConfirmed", "loanInterest", "loanStatus", "objection", "decisionMakerMet",
]);

export const PATCH = route<P>("leads:edit", async ({ req, session, params }) => {
  const lead = await getLeadForSession(session, params.id);
  const input = await parseBody(req, leadUpdateSchema);
  const { assignedToId, phone, altPhone, lat, lng, ...rest } = input;
  const data: Record<string, unknown> = { ...rest };
  if (phone !== undefined) {
    const p = normalizePhone(phone);
    if (!p) throw new ApiError(400, "Invalid mobile number");
    data.phone = p;
  }
  if (altPhone !== undefined) data.altPhone = altPhone ? normalizePhone(altPhone) : null;
  if (lat !== undefined || lng !== undefined) {
    data.lat = lat ?? null;
    data.lng = lng ?? null;
    // Only managers can set a verified site pin; anyone else moving it makes it unverified.
    data.sitePinned = can(session.role, "quotations:review") && lat != null && lng != null;
  }
  if (assignedToId !== undefined && can(session.role, "leads:assign")) data.assignedToId = assignedToId;
  await db.lead.update({ where: { id: lead.id }, data });
  if (Object.keys(input).some((k) => QUAL_FIELDS.has(k))) {
    await logActivity({ orgId: session.orgId, leadId: lead.id, userId: session.userId, type: "QUALIFICATION", title: "Qualification details updated" });
    await db.lead.update({ where: { id: lead.id }, data: { lastContactAt: new Date() } });
  }
  return requalify(lead.id, session.userId);
});

export const DELETE = route<P>("leads:delete", async ({ session, params }) => {
  const lead = await getLeadForSession(session, params.id);
  await db.lead.delete({ where: { id: lead.id } });
  await audit({ orgId: session.orgId, userId: session.userId, action: "delete", entity: "lead", entityId: lead.id, meta: { code: lead.code, name: lead.name } });
  return { ok: true };
});

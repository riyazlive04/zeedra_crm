import crypto from "node:crypto";
import { z } from "zod";
import { format } from "date-fns";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { fireTrigger, leadTemplateVars } from "@/lib/automation/engine";
import { advanceStage } from "@/lib/services/field";
import { changeStage } from "@/lib/services/leads";
import { createProjectForLead } from "@/lib/services/projects";
import { sendWhatsApp } from "@/lib/whatsapp";
import { formatINR } from "@/lib/text";

type P = { id: string };

async function load(orgId: string, id: string) {
  const q = await db.quotation.findFirst({ where: { id, organizationId: orgId }, include: { lead: true } });
  if (!q) throw new ApiError(404, "Quotation not found");
  return q;
}

export const GET = route<P>(null, async ({ session, params }) => {
  const q = await load(session.orgId, params.id);
  if (!can(session.role, "quotations:review") && q.createdById !== session.userId && q.lead.assignedToId !== session.userId)
    throw new ApiError(404, "Quotation not found");
  return q;
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), via: z.enum(["WHATSAPP", "MANUAL"]).default("WHATSAPP") }),
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("reject"), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("review"), approve: z.boolean(), note: z.string().max(1000).optional(), pinSiteFromCapture: z.boolean().optional() }),
]);

export const POST = route<P>("quotations:create", async ({ req, session, params }) => {
  const body = await parseBody(req, schema);
  const q = await load(session.orgId, params.id);
  const isOwner = q.createdById === session.userId || q.lead.assignedToId === session.userId;
  if (!isOwner && !can(session.role, "quotations:review")) throw new ApiError(403, "Not your quotation");

  switch (body.action) {
    case "send": {
      if (q.status === "EXPIRED") throw new ApiError(400, "Quotation has expired — create a new version");
      const updated = await db.quotation.update({
        where: { id: q.id },
        data: { status: "SENT", sentAt: new Date(), shareToken: q.shareToken ?? crypto.randomBytes(18).toString("base64url") },
      });
      await advanceStage(q.leadId, "QUOTATION_SENT", session.userId);
      let whatsapp: Awaited<ReturnType<typeof sendWhatsApp>> | null = null;
      const vars = {
        ...(await leadTemplateVars(q.lead)),
        quoteNumber: q.number,
        kw: q.systemKw,
        netCost: formatINR(q.netCost),
        validUntil: format(q.validUntil, "d MMM yyyy"),
        quoteLink: `${process.env.APP_URL ?? ""}/q/${updated.shareToken}`,
      };
      // Rule-driven send (default playbook) — falls back to a direct send if no rule is active.
      const ran = await fireTrigger("QUOTATION_SENT", { orgId: session.orgId, leadId: q.leadId, refKey: `qsent:${q.id}:${Date.now()}`, vars });
      if (!ran && body.via === "WHATSAPP") {
        whatsapp = await sendWhatsApp({ orgId: session.orgId, phone: q.lead.phone, templateKey: "quotation_sent", vars, leadId: q.leadId, userId: session.userId }).catch(() => null);
      }
      return { quotation: updated, whatsapp, link: vars.quoteLink };
    }
    case "accept": {
      const updated = await db.quotation.update({ where: { id: q.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      await db.lead.update({ where: { id: q.leadId }, data: { dealValue: q.totalAmount } });
      await changeStage(session, q.leadId, "WON", { dealValue: q.totalAmount });
      await createProjectForLead(session, q.leadId);
      return updated;
    }
    case "reject": {
      const updated = await db.quotation.update({ where: { id: q.id }, data: { status: "REJECTED" } });
      await logActivity({ orgId: session.orgId, leadId: q.leadId, userId: session.userId, type: "QUOTATION", title: `Quotation ${q.number} rejected`, body: body.reason });
      return updated;
    }
    case "review": {
      if (!can(session.role, "quotations:review")) throw new ApiError(403, "Only managers can review validations");
      if (body.pinSiteFromCapture) {
        if (q.capturedLat == null || q.capturedLng == null) throw new ApiError(400, "No GPS capture on this quotation");
        await db.lead.update({ where: { id: q.leadId }, data: { lat: q.capturedLat, lng: q.capturedLng, sitePinned: true } });
      }
      const updated = await db.quotation.update({
        where: { id: q.id },
        data: {
          reviewedById: session.userId,
          reviewNote: `${body.approve ? "Approved" : "Rejected"}${body.note ? ` — ${body.note}` : ""}`,
          ...(body.approve && body.pinSiteFromCapture ? { geoVerdict: "VERIFIED" as const, distanceFromSiteM: 0 } : {}),
        },
      });
      await logActivity({
        orgId: session.orgId,
        leadId: q.leadId,
        userId: session.userId,
        type: "QUOTATION",
        title: `Location validation ${body.approve ? "approved" : "rejected"} for ${q.number}`,
        body: body.note,
      });
      return updated;
    }
  }
});

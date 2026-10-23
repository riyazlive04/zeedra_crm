import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { STAGES } from "@/lib/validators";
import { changeStage, getLeadForSession } from "@/lib/services/leads";
import { createProjectForLead } from "@/lib/services/projects";
import { ApiError } from "@/lib/errors";
import { logActivity, notify } from "@/lib/activity";
import { can } from "@/lib/rbac";

/**
 * Lead actions in one endpoint: stage changes, assignment, notes/call logs and site pinning.
 * Body: { action: "stage" | "assign" | "note" | "pinSite", ... }
 */
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stage"), stage: z.enum(STAGES), lostReason: z.string().max(500).nullable().optional(), dealValue: z.number().positive().nullable().optional() }),
  z.object({ action: z.literal("assign"), userId: z.string().nullable() }),
  z.object({
    action: z.literal("note"),
    kind: z.enum(["NOTE", "CALL"]),
    body: z.string().trim().min(1).max(4000),
    callOutcome: z.enum(["CONNECTED", "NO_ANSWER", "BUSY", "SWITCHED_OFF", "WRONG_NUMBER", "CALL_BACK"]).optional(),
    nextFollowUpAt: z.coerce.date().nullable().optional(),
  }),
  z.object({ action: z.literal("pinSite"), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
]);

export const POST = route<{ id: string }>("leads:edit", async ({ req, session, params }) => {
  const body = await parseBody(req, schema);
  const lead = await getLeadForSession(session, params.id);

  switch (body.action) {
    case "stage": {
      const updated = await changeStage(session, lead.id, body.stage, body);
      if (body.stage === "WON") await createProjectForLead(session, lead.id);
      return updated;
    }
    case "assign": {
      if (!can(session.role, "leads:assign")) throw new ApiError(403, "Only managers can reassign leads");
      let name = "Unassigned";
      if (body.userId) {
        const u = await db.user.findFirst({ where: { id: body.userId, organizationId: session.orgId, active: true } });
        if (!u) throw new ApiError(400, "User not found");
        name = u.name;
      }
      const updated = await db.lead.update({ where: { id: lead.id }, data: { assignedToId: body.userId } });
      await logActivity({ orgId: session.orgId, leadId: lead.id, userId: session.userId, type: "ASSIGNMENT", title: `Assigned to ${name}` });
      if (body.userId && body.userId !== session.userId)
        await notify(session.orgId, body.userId, "Lead assigned to you", `${lead.name} · ${lead.code}`, `/leads/${lead.id}`);
      return updated;
    }
    case "note": {
      const title = body.kind === "CALL" ? `Call — ${(body.callOutcome ?? "CONNECTED").replace(/_/g, " ").toLowerCase()}` : "Note";
      const a = await logActivity({ orgId: session.orgId, leadId: lead.id, userId: session.userId, type: body.kind, title, body: body.body });
      const reached = body.kind === "CALL" && !["NO_ANSWER", "SWITCHED_OFF", "BUSY", "WRONG_NUMBER"].includes(body.callOutcome ?? "CONNECTED");
      await db.lead.update({
        where: { id: lead.id },
        data: {
          ...(reached ? { lastContactAt: new Date() } : {}),
          ...(reached && lead.stage === "NEW" ? { stage: "CONTACTED" as const } : {}),
          ...(body.nextFollowUpAt !== undefined ? { nextFollowUpAt: body.nextFollowUpAt } : {}),
        },
      });
      if (reached && lead.stage === "NEW")
        await logActivity({ orgId: session.orgId, leadId: lead.id, userId: session.userId, type: "STAGE_CHANGE", title: "Stage New → Contacted" });
      return a;
    }
    case "pinSite": {
      if (!can(session.role, "quotations:review")) throw new ApiError(403, "Only managers can confirm the site location");
      const updated = await db.lead.update({ where: { id: lead.id }, data: { lat: body.lat, lng: body.lng, sitePinned: true } });
      await logActivity({
        orgId: session.orgId,
        leadId: lead.id,
        userId: session.userId,
        type: "SYSTEM",
        title: "Site location confirmed by manager",
        body: `${body.lat.toFixed(5)}, ${body.lng.toFixed(5)}`,
      });
      return updated;
    }
  }
});

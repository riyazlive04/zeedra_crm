import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { getLeadForSession, leadScope } from "@/lib/services/leads";
import { sendWhatsApp } from "@/lib/whatsapp";
import { leadTemplateVars } from "@/lib/automation/engine";
import { aiDraftReply, aiEnabled, describeAiError } from "@/lib/ai";
import { ApiError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

/** Inbox: latest message per lead the user can see. */
export const GET = route(null, async ({ session }) => {
  const latest = await db.whatsAppMessage.findMany({
    where: { organizationId: session.orgId, leadId: { not: null }, lead: leadScope(session) },
    orderBy: { createdAt: "desc" },
    take: 600,
    select: { leadId: true, body: true, direction: true, status: true, createdAt: true, lead: { select: { id: true, name: true, code: true, phone: true, temperature: true } } },
  });
  const seen = new Map<string, (typeof latest)[number] & { unread: number }>();
  for (const m of latest) {
    const cur = seen.get(m.leadId!);
    if (!cur) seen.set(m.leadId!, { ...m, unread: m.direction === "IN" && m.status === "RECEIVED" ? 1 : 0 });
    else if (m.direction === "IN" && m.status === "RECEIVED" && cur.direction === "IN") cur.unread++;
  }
  return Array.from(seen.values()).slice(0, 200);
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), leadId: z.string(), body: z.string().trim().min(1).max(4096).optional(), templateKey: z.string().optional() }),
  z.object({ action: z.literal("draft"), leadId: z.string() }),
  z.object({ action: z.literal("markRead"), leadId: z.string() }),
]);

export const POST = route("whatsapp:send", async ({ req, session }) => {
  const body = await parseBody(req, schema);
  const lead = await getLeadForSession(session, body.leadId);

  if (body.action === "markRead") {
    await db.whatsAppMessage.updateMany({ where: { leadId: lead.id, direction: "IN", status: "RECEIVED" }, data: { status: "READ" } });
    return { ok: true };
  }

  if (body.action === "draft") {
    const convo = await db.whatsAppMessage.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" }, take: 12, select: { direction: true, body: true } });
    if (!aiEnabled()) {
      const v = await leadTemplateVars(lead);
      return {
        draft: lead.monthlyBill
          ? `Hi ${v.name}, thanks for your message! For your ${v.bill} bill, a ${v.kw} kW system costs ${v.netCost} after subsidy and saves ~${v.savings}/month. Shall I book a free site survey for this week?`
          : `Hi ${v.name}, thanks for your message! Could you share a photo of your latest EB bill so I can send the exact system size and subsidy?`,
        source: "rules",
      };
    }
    await rateLimit(`ai:${session.orgId}`, 120, 3600);
    try {
      const draft = await aiDraftReply(
        { name: lead.name, city: lead.city, monthlyBill: lead.monthlyBill, recommendedKw: lead.recommendedKw, stage: lead.stage, temperature: lead.temperature, objection: lead.objection },
        convo.reverse(),
      );
      return { draft, source: "ai" };
    } catch (e) {
      throw new ApiError(502, describeAiError(e));
    }
  }

  if (!body.body && !body.templateKey) throw new ApiError(400, "Message text or template required");
  const vars = body.templateKey ? await leadTemplateVars(lead) : undefined;
  return sendWhatsApp({ orgId: session.orgId, phone: lead.phone, body: body.body, templateKey: body.templateKey, vars, leadId: lead.id, userId: session.userId });
});

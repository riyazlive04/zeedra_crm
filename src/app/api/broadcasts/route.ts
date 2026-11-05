import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { audienceWhere, parseGraph, runNurture } from "@/lib/nurture/engine";
import { validateFlow } from "@/lib/nurture/types";
import { audienceSchema } from "@/lib/nurture/schema";

export const GET = route(null, async ({ session }) => {
  const list = await db.broadcast.findMany({ where: { organizationId: session.orgId }, orderBy: { createdAt: "desc" }, take: 100, omit: { queue: true } });
  const ids = list.map((b) => b.id);
  const msgs = ids.length ? await db.whatsAppMessage.groupBy({ by: ["broadcastId", "status"], where: { broadcastId: { in: ids } }, _count: true }) : [];
  return list.map((b) => {
    const c = (st: string[]) => msgs.filter((m) => m.broadcastId === b.id && st.includes(m.status)).reduce((a, m) => a + m._count, 0);
    return { ...b, delivery: { sent: c(["SENT", "DELIVERED", "READ", "SIMULATED"]), delivered: c(["DELIVERED", "READ"]), read: c(["READ"]), failed: c(["FAILED"]) } };
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  templateKey: z.string().nullable().optional(),
  flowId: z.string().nullable().optional(),
  audience: audienceSchema,
  scheduledAt: z.string().datetime().nullable().optional(),
});

export const POST = route("automations:manage", async ({ req, session }) => {
  const input = await parseBody(req, createSchema);
  if (!input.templateKey === !input.flowId) throw new ApiError(400, "Choose either a template or a flow");
  if (input.templateKey && !(await db.messageTemplate.findFirst({ where: { organizationId: session.orgId, key: input.templateKey, active: true } })))
    throw new ApiError(400, "Template not found or inactive");
  if (input.flowId) {
    const flow = await db.flow.findFirst({ where: { organizationId: session.orgId, id: input.flowId } });
    if (!flow) throw new ApiError(400, "Flow not found");
    const issues = validateFlow(parseGraph(flow.graph));
    if (issues.length) throw new ApiError(400, `Fix the flow before broadcasting it: ${issues.join("; ")}`);
  }
  const total = await db.lead.count({ where: audienceWhere(session.orgId, input.audience) });
  if (!total) throw new ApiError(400, "No opted-in leads match this audience");
  const when = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
  const b = await db.broadcast.create({
    data: {
      organizationId: session.orgId,
      name: input.name,
      templateKey: input.templateKey ?? null,
      flowId: input.flowId ?? null,
      audience: input.audience as unknown as Prisma.InputJsonValue,
      scheduledAt: when,
      total,
      createdById: session.userId,
    },
  });
  // "Send now" shouldn't wait for the next scheduler tick.
  if (when.getTime() <= Date.now() + 5000) await runNurture();
  return { id: b.id, total };
});

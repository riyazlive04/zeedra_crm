import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";

type P = { id: string };

/** Per-node counts for the mind map + message funnel + recent runs. */
export const GET = route<P>(null, async ({ session, params }) => {
  const flow = await db.flow.findFirst({ where: { id: params.id, organizationId: session.orgId }, select: { id: true } });
  if (!flow) throw new ApiError(404, "Flow not found");
  const [steps, msgs, runs, statusCounts] = await Promise.all([
    db.flowStep.groupBy({ by: ["nodeId", "outcome"], where: { flowId: flow.id }, _count: true }),
    db.whatsAppMessage.groupBy({ by: ["flowNodeId", "status"], where: { flowId: flow.id }, _count: true }),
    db.flowRun.findMany({
      where: { flowId: flow.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, status: true, currentNodeId: true, nextRunAt: true, stopReason: true, startedAt: true, lead: { select: { id: true, name: true, code: true } } },
    }),
    db.flowRun.groupBy({ by: ["status"], where: { flowId: flow.id }, _count: true }),
  ]);
  // Replies attributed to this flow: inbound messages from leads in the flow after they entered it.
  const leadIds = (await db.flowRun.findMany({ where: { flowId: flow.id }, select: { leadId: true, startedAt: true } }));
  let replied = 0;
  if (leadIds.length) {
    const minStart = new Date(Math.min(...leadIds.map((l) => l.startedAt.getTime())));
    const inbound = await db.whatsAppMessage.findMany({
      where: { organizationId: session.orgId, direction: "IN", leadId: { in: leadIds.map((l) => l.leadId) }, createdAt: { gte: minStart } },
      select: { leadId: true, createdAt: true },
    });
    const startOf = new Map(leadIds.map((l) => [l.leadId, l.startedAt.getTime()]));
    replied = new Set(inbound.filter((m) => m.leadId && m.createdAt.getTime() >= (startOf.get(m.leadId) ?? Infinity)).map((m) => m.leadId)).size;
  }
  const nodes: Record<string, { entered: number; outcomes: Record<string, number>; sent: number; delivered: number; read: number; failed: number }> = {};
  const n = (id: string) => (nodes[id] ??= { entered: 0, outcomes: {}, sent: 0, delivered: 0, read: 0, failed: 0 });
  for (const s of steps) {
    const o = (s.outcome ?? "").startsWith("failed") ? "failed" : (s.outcome ?? "");
    n(s.nodeId).outcomes[o] = (n(s.nodeId).outcomes[o] ?? 0) + s._count;
    if (!["waiting", "waiting for reply"].includes(o)) n(s.nodeId).entered += s._count;
  }
  for (const m of msgs) {
    if (!m.flowNodeId) continue;
    const x = n(m.flowNodeId);
    const c = m._count;
    if (m.status === "FAILED") x.failed += c;
    else {
      x.sent += c;
      if (m.status === "DELIVERED" || m.status === "READ") x.delivered += c;
      if (m.status === "READ") x.read += c;
    }
  }
  const total = statusCounts.reduce((a, s) => a + s._count, 0);
  return { nodes, runs, totals: { total, replied, ...Object.fromEntries(statusCounts.map((s) => [s.status, s._count])) } };
});

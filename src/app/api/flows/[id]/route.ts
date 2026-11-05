import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { validateFlow, type FlowGraph } from "@/lib/nurture/types";
import { parseGraph } from "@/lib/nurture/engine";

type P = { id: string };

async function getFlow(orgId: string, id: string) {
  const f = await db.flow.findFirst({ where: { id, organizationId: orgId } });
  if (!f) throw new ApiError(404, "Flow not found");
  return f;
}

export const GET = route<P>(null, async ({ session, params }) => getFlow(session.orgId, params.id));

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
  graph: z.object({ nodes: z.array(z.any()).max(200), edges: z.array(z.any()).max(400) }).optional(),
  settings: z
    .object({
      stopOnReply: z.boolean(),
      stopStages: z.array(z.string()),
      quietStart: z.number().int().min(0).max(23),
      quietEnd: z.number().int().min(0).max(23),
      reentry: z.boolean(),
    })
    .optional(),
});

export const PATCH = route<P>("automations:manage", async ({ req, session, params }) => {
  const flow = await getFlow(session.orgId, params.id);
  const input = await parseBody(req, patchSchema);
  const graph: FlowGraph = input.graph ? (input.graph as FlowGraph) : parseGraph(flow.graph);
  if (input.active ?? flow.active) {
    const issues = validateFlow(graph);
    if (issues.length) throw new ApiError(400, `Fix before activating: ${issues.join("; ")}`);
  }
  // Templates referenced by message nodes must exist in this org.
  const keys = graph.nodes.flatMap((n) => (n.data.kind === "message" && n.data.templateKey ? [n.data.templateKey] : []));
  if (keys.length) {
    const found = await db.messageTemplate.count({ where: { organizationId: session.orgId, key: { in: keys } } });
    if (found < new Set(keys).size) throw new ApiError(400, "A message step uses a template that no longer exists");
  }
  return db.flow.update({
    where: { id: flow.id },
    data: {
      name: input.name,
      description: input.description,
      active: input.active,
      graph: input.graph as unknown as Prisma.InputJsonValue | undefined,
      settings: input.settings as unknown as Prisma.InputJsonValue | undefined,
    },
  });
});

export const DELETE = route<P>("automations:manage", async ({ session, params }) => {
  const flow = await getFlow(session.orgId, params.id);
  await db.flow.delete({ where: { id: flow.id } });
  return { ok: true };
});

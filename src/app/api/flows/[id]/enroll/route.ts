import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { startFlow } from "@/lib/nurture/engine";

type P = { id: string };

const schema = z.object({ leadIds: z.array(z.string()).min(1).max(200) });

/** Manually put specific leads into a flow (also used to test a flow on yourself). */
export const POST = route<P>("automations:manage", async ({ req, session, params }) => {
  const flow = await db.flow.findFirst({ where: { id: params.id, organizationId: session.orgId } });
  if (!flow) throw new ApiError(404, "Flow not found");
  const { leadIds } = await parseBody(req, schema);
  const leads = await db.lead.findMany({ where: { id: { in: leadIds }, organizationId: session.orgId }, select: { id: true, whatsappOptIn: true } });
  let started = 0, skipped = 0;
  for (const l of leads) {
    if (!l.whatsappOptIn) { skipped++; continue; }
    if (await startFlow(flow, l.id, { force: true })) started++;
    else skipped++;
  }
  return { started, skipped };
});

import type { Prisma } from "@prisma/client";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { TRIGGERS } from "@/lib/automation/types";
import { ApiError } from "@/lib/errors";
import { ruleSchema } from "./schema";

export const GET = route(null, async ({ session }) => {
  const rules = await db.automationRule.findMany({ where: { organizationId: session.orgId }, orderBy: { createdAt: "asc" } });
  const recentErrors = await db.automationRun.findMany({
    where: { ruleId: { in: rules.map((r) => r.id) }, status: "ERROR" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return { rules, recentErrors };
});

export const POST = route("automations:manage", async ({ req, session }) => {
  const body = await parseBody(req, ruleSchema);
  if (TRIGGERS[body.trigger].kind === "schedule" && body.delayMinutes < 5)
    throw new ApiError(400, "Scheduled triggers need a time window of at least 5 minutes");
  await assertTemplates(session.orgId, body.actions);
  return db.automationRule.create({
    data: {
      ...body,
      organizationId: session.orgId,
      conditions: body.conditions as unknown as Prisma.InputJsonValue,
      actions: body.actions as unknown as Prisma.InputJsonValue,
    },
  });
});

async function assertTemplates(orgId: string, actions: { type: string; templateKey?: string }[]) {
  const keys = actions.filter((a) => a.type === "SEND_WHATSAPP").map((a) => a.templateKey!);
  if (!keys.length) return;
  const found = await db.messageTemplate.count({ where: { organizationId: orgId, key: { in: keys } } });
  if (found !== new Set(keys).size) throw new ApiError(400, "One of the selected WhatsApp templates does not exist");
}

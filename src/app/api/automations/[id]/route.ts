import type { Prisma } from "@prisma/client";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ruleSchema } from "../schema";

type P = { id: string };

export const PATCH = route<P>("automations:manage", async ({ req, session, params }) => {
  const body = await parseBody(req, ruleSchema.partial());
  const rule = await db.automationRule.findFirst({ where: { id: params.id, organizationId: session.orgId } });
  if (!rule) throw new ApiError(404, "Automation not found");
  if (body.actions) {
    const keys = body.actions.flatMap((a) => (a.type === "SEND_WHATSAPP" ? [a.templateKey] : []));
    if (keys.length && (await db.messageTemplate.count({ where: { organizationId: session.orgId, key: { in: keys } } })) !== new Set(keys).size)
      throw new ApiError(400, "One of the selected WhatsApp templates does not exist");
  }
  return db.automationRule.update({
    where: { id: rule.id },
    data: {
      ...body,
      conditions: body.conditions as unknown as Prisma.InputJsonValue | undefined,
      actions: body.actions as unknown as Prisma.InputJsonValue | undefined,
    },
  });
});

export const DELETE = route<P>("automations:manage", async ({ session, params }) => {
  const rule = await db.automationRule.findFirst({ where: { id: params.id, organizationId: session.orgId } });
  if (!rule) throw new ApiError(404, "Automation not found");
  await db.automationRule.delete({ where: { id: rule.id } });
  return { ok: true };
});

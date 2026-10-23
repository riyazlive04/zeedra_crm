import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { templateSchema } from "../schema";

type P = { id: string };

export const PATCH = route<P>("templates:manage", async ({ req, session, params }) => {
  const body = await parseBody(req, templateSchema.omit({ key: true }).partial());
  const t = await db.messageTemplate.findFirst({ where: { id: params.id, organizationId: session.orgId } });
  if (!t) throw new ApiError(404, "Template not found");
  return db.messageTemplate.update({ where: { id: t.id }, data: body });
});

export const DELETE = route<P>("templates:manage", async ({ session, params }) => {
  const t = await db.messageTemplate.findFirst({ where: { id: params.id, organizationId: session.orgId } });
  if (!t) throw new ApiError(404, "Template not found");
  const rules = await db.automationRule.findMany({ where: { organizationId: session.orgId }, select: { name: true, actions: true } });
  const using = rules.filter((r) => JSON.stringify(r.actions).includes(`"templateKey":"${t.key}"`));
  if (using.length) throw new ApiError(409, `Used by automation: ${using.map((r) => r.name).join(", ")}. Deactivate instead.`);
  await db.messageTemplate.delete({ where: { id: t.id } });
  return { ok: true };
});

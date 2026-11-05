import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/activity";
import { roleSchema } from "@/lib/roles";

/** Company-defined roles with how many people have each. */
export const GET = route(null, async ({ session }) => {
  const roles = await db.customRole.findMany({ where: { organizationId: session.orgId }, orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } });
  return roles.map(({ _count, ...r }) => ({ ...r, userCount: _count.users }));
});

export const POST = route("users:manage", async ({ req, session }) => {
  const input = await parseBody(req, roleSchema);
  if (await db.customRole.findFirst({ where: { organizationId: session.orgId, name: input.name } })) throw new ApiError(409, "A role with this name already exists");
  const role = await db.customRole.create({ data: { organizationId: session.orgId, ...input } });
  await audit({ orgId: session.orgId, userId: session.userId, action: "create", entity: "role", entityId: role.id, meta: { name: role.name } });
  return Response.json(role, { status: 201 });
});

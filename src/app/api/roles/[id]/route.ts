import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/activity";
import { roleSchema } from "@/lib/roles";

type P = { id: string };

async function own(orgId: string, id: string) {
  const r = await db.customRole.findFirst({ where: { id, organizationId: orgId } });
  if (!r) throw new ApiError(404, "Role not found");
  return r;
}

/** Edit a role. Everyone who has it picks up the change on their next page load. */
export const PATCH = route<P>("users:manage", async ({ req, session, params }) => {
  const role = await own(session.orgId, params.id);
  const input = await parseBody(req, roleSchema.partial());
  if (input.name && input.name !== role.name && (await db.customRole.findFirst({ where: { organizationId: session.orgId, name: input.name } })))
    throw new ApiError(409, "A role with this name already exists");
  const updated = await db.$transaction(async (tx) => {
    const r = await tx.customRole.update({ where: { id: role.id }, data: input });
    // Keep people's built-in role (data scope) in step with the role they hold.
    if (input.baseRole) await tx.user.updateMany({ where: { customRoleId: role.id, role: { not: "OWNER" } }, data: { role: input.baseRole } });
    return r;
  });
  await audit({ orgId: session.orgId, userId: session.userId, action: "update", entity: "role", entityId: role.id, meta: { fields: Object.keys(input) } });
  return updated;
});

/** People with this role fall back to the built-in role it was based on. */
export const DELETE = route<P>("users:manage", async ({ session, params }) => {
  const role = await own(session.orgId, params.id);
  await db.customRole.delete({ where: { id: role.id } });
  await audit({ orgId: session.orgId, userId: session.userId, action: "delete", entity: "role", entityId: role.id, meta: { name: role.name } });
  return { ok: true };
});

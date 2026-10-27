import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { ROLES } from "@/lib/validators";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/activity";
import { can } from "@/lib/rbac";
import { normalizePhone } from "@/lib/text";

const schema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  role: z.enum(ROLES).optional(),
  territory: z.string().trim().max(80).nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
  currentPassword: z.string().max(200).optional(),
  pin: z.string().regex(/^\d{4,6}$/, "4-6 digit PIN").nullable().optional(),
});

/** Admins manage anyone; every user can edit their own name/phone/password. */
export const PATCH = route<{ id: string }>(null, async ({ req, session, params }) => {
  const body = await parseBody(req, schema);
  const target = await db.user.findFirst({ where: { id: params.id, organizationId: session.orgId } });
  if (!target) throw new ApiError(404, "User not found");
  const self = target.id === session.userId;
  const admin = can(session.role, "users:manage");
  if (!self && !admin) throw new ApiError(403, "You can only edit your own profile");

  if ((body.role || body.active !== undefined) && !admin) throw new ApiError(403, "Only admins can change roles or access");
  if (target.role === "OWNER" && (body.role && body.role !== "OWNER" || body.active === false)) throw new ApiError(400, "The owner account cannot be demoted or deactivated");
  if (body.role === "OWNER") throw new ApiError(400, "Ownership transfer is handled by support");
  if ((body.password || body.pin !== undefined) && self) {
    if (!body.currentPassword || !(await verifyPassword(body.currentPassword, target.passwordHash))) throw new ApiError(400, "Current password is incorrect");
  }
  if (body.pin !== undefined && !self) throw new ApiError(403, "A PIN can only be set by its own owner");

  const updated = await db.user.update({
    where: { id: target.id },
    data: {
      name: body.name,
      phone: body.phone === undefined ? undefined : body.phone ? normalizePhone(body.phone) : null,
      role: body.role,
      territory: body.territory,
      active: body.active,
      passwordHash: body.password ? await hashPassword(body.password) : undefined,
      pinHash: body.pin !== undefined ? (body.pin ? await hashPassword(body.pin) : null) : undefined,
      pinSetAt: body.pin !== undefined ? (body.pin ? new Date() : null) : undefined,
    },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (body.active === false) {
    // Hand the deactivated user's open leads back to the unassigned pool.
    await db.lead.updateMany({ where: { organizationId: session.orgId, assignedToId: target.id, stage: { notIn: ["WON", "LOST", "DISQUALIFIED"] } }, data: { assignedToId: null } });
  }
  await audit({ orgId: session.orgId, userId: session.userId, action: "update", entity: "user", entityId: target.id, meta: { fields: Object.keys(body).filter((k) => !k.toLowerCase().includes("password")) } });
  return updated;
});

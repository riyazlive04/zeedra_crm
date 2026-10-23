import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { ROLES } from "@/lib/validators";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/activity";
import { normalizePhone } from "@/lib/text";

const COLORS = ["#22c55e", "#3b82f6", "#f97316", "#ec4899", "#14b8a6", "#a855f7", "#eab308", "#ef4444", "#6366f1"];

export const GET = route(null, async ({ session }) =>
  db.user.findMany({
    where: { organizationId: session.orgId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, phone: true, role: true, active: true, territory: true, avatarColor: true, googleEmail: true, lastLoginAt: true },
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(20).optional(),
  role: z.enum(ROLES).refine((r) => r !== "OWNER", "Only one owner per organisation"),
  territory: z.string().trim().max(80).optional(),
  password: z.string().min(8).max(200),
});

export const POST = route("users:manage", async ({ req, session }) => {
  const body = await parseBody(req, createSchema);
  if (await db.user.findUnique({ where: { email: body.email } })) throw new ApiError(409, "A user with this email already exists");
  const count = await db.user.count({ where: { organizationId: session.orgId } });
  const user = await db.user.create({
    data: {
      organizationId: session.orgId,
      name: body.name,
      email: body.email,
      phone: body.phone ? normalizePhone(body.phone) : null,
      role: body.role,
      territory: body.territory || null,
      passwordHash: await hashPassword(body.password),
      avatarColor: COLORS[count % COLORS.length],
    },
    select: { id: true, name: true, email: true, role: true },
  });
  await audit({ orgId: session.orgId, userId: session.userId, action: "create", entity: "user", entityId: user.id, meta: { role: body.role } });
  return Response.json(user, { status: 201 });
});

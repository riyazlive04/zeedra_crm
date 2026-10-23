import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = route(null, async ({ session }) => {
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: session.userId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.notification.count({ where: { userId: session.userId, read: false } }),
  ]);
  return { items, unread };
});

export const POST = route(null, async ({ req, session }) => {
  const body = await parseBody(req, z.object({ id: z.string().optional() }));
  await db.notification.updateMany({ where: { userId: session.userId, ...(body.id ? { id: body.id } : {}) }, data: { read: true } });
  return { ok: true };
});

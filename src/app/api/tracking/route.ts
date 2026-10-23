import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/** Heartbeat from the field app while the salesperson is on duty (foreground only, every ~5 min). */
const pingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100_000).nullable().optional(),
  deviceTime: z.coerce.date().optional(),
});

export const POST = route(null, async ({ req, session }) => {
  const p = await parseBody(req, pingSchema);
  await rateLimit(`ping:${session.userId}`, 30, 600);
  await db.locationPing.create({
    data: { organizationId: session.orgId, userId: session.userId, lat: p.lat, lng: p.lng, accuracyM: p.accuracyM ?? null, deviceTime: p.deviceTime ?? null, source: "HEARTBEAT" },
  });
  return { ok: true };
});

/** Manager view: last known position per field user + today's trail. */
export const GET = route("tracking:view", async ({ session }) => {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const users = await db.user.findMany({
    where: { organizationId: session.orgId, active: true, role: { in: ["FIELD_SALES", "SALES_MANAGER"] } },
    select: { id: true, name: true, avatarColor: true, role: true, territory: true, phone: true },
  });
  const pings = await db.locationPing.findMany({
    where: { organizationId: session.orgId, userId: { in: users.map((u) => u.id) }, createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
    orderBy: { createdAt: "asc" },
    select: { userId: true, lat: true, lng: true, createdAt: true, source: true, accuracyM: true },
  });
  return users.map((u) => {
    const mine = pings.filter((p) => p.userId === u.id);
    return { ...u, last: mine[mine.length - 1] ?? null, trail: mine.filter((p) => p.createdAt >= since) };
  });
});

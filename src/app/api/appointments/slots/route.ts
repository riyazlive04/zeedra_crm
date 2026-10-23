import { route, searchParams } from "@/lib/api";
import { availableSlots } from "@/lib/services/appointments";
import { ApiError } from "@/lib/errors";
import { db } from "@/lib/db";

export const GET = route("appointments:manage", async ({ req, session }) => {
  const q = searchParams(req);
  const userId = q.get("userId") ?? session.userId;
  const date = q.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "date must be YYYY-MM-DD");
  const user = await db.user.findFirst({ where: { id: userId, organizationId: session.orgId }, select: { id: true, googleRefreshToken: true } });
  if (!user) throw new ApiError(404, "User not found");
  return { slots: await availableSlots(session, userId, date), googleConnected: Boolean(user.googleRefreshToken) };
});

import { z } from "zod";
import { route, parseBody, searchParams } from "@/lib/api";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { dutyHistory } from "@/lib/services/duty";

/** Logged from the field app whenever duty-sharing is toggled, or the browser's location
 *  permission changes — so managers can later tell "off duty" apart from "permission denied". */
const statusSchema = z.object({
  type: z.enum(["ON_DUTY", "OFF_DUTY", "PERMISSION_GRANTED", "PERMISSION_DENIED"]),
  deviceTime: z.coerce.date().optional(),
});

export const POST = route(null, async ({ req, session }) => {
  const p = await parseBody(req, statusSchema);
  await rateLimit(`duty-status:${session.userId}`, 60, 600);
  await db.locationStatusEvent.create({
    data: { organizationId: session.orgId, userId: session.userId, type: p.type, deviceTime: p.deviceTime ?? null },
  });
  return { ok: true };
});

/** Manager report: duty on/off + permission history per field user, with on-duty durations. */
export const GET = route("tracking:view", async ({ req, session }) => {
  const q = searchParams(req);
  const days = Math.min(Math.max(Number(q.get("days")) || 1, 1), 30);
  const userId = q.get("userId") ?? undefined;
  return dutyHistory(session.orgId, { days, userId });
});

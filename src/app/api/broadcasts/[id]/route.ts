import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";

type P = { id: string };

/** Cancel a scheduled or in-progress broadcast (already-sent messages stay sent). */
export const DELETE = route<P>("automations:manage", async ({ session, params }) => {
  const b = await db.broadcast.findFirst({ where: { id: params.id, organizationId: session.orgId } });
  if (!b) throw new ApiError(404, "Broadcast not found");
  if (b.status === "SENT" || b.status === "CANCELLED") throw new ApiError(400, "This broadcast has already finished");
  await db.broadcast.update({ where: { id: b.id }, data: { status: "CANCELLED", queue: [], completedAt: new Date() } });
  return { ok: true };
});

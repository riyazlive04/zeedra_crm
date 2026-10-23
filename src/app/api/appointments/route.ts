import type { Prisma } from "@prisma/client";
import { route, parseBody, searchParams } from "@/lib/api";
import { db } from "@/lib/db";
import { appointmentInputSchema, bookAppointment } from "@/lib/services/appointments";
import { can } from "@/lib/rbac";

export const GET = route(null, async ({ req, session }) => {
  const q = searchParams(req);
  const from = q.get("from") ? new Date(q.get("from")!) : new Date(Date.now() - 7 * 86_400_000);
  const to = q.get("to") ? new Date(q.get("to")!) : new Date(Date.now() + 30 * 86_400_000);
  const where: Prisma.AppointmentWhereInput = { organizationId: session.orgId, startAt: { gte: from, lte: to } };
  if (!can(session.role, "leads:view_all")) where.assignedToId = session.userId;
  else if (q.get("userId")) where.assignedToId = q.get("userId")!;
  if (q.get("status")) where.status = q.get("status") as Prisma.AppointmentWhereInput["status"];
  return db.appointment.findMany({
    where,
    orderBy: { startAt: "asc" },
    take: 1000,
    include: {
      lead: { select: { id: true, name: true, phone: true, code: true, city: true, temperature: true, address: true } },
      assignedTo: { select: { id: true, name: true, avatarColor: true } },
    },
  });
});

export const POST = route("appointments:manage", async ({ req, session }) => {
  const input = await parseBody(req, appointmentInputSchema);
  return Response.json(await bookAppointment(session, input), { status: 201 });
});

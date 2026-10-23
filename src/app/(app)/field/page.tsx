import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { FieldApp } from "@/components/field/field-app";

export const metadata = { title: "Field App" };

export default async function FieldPage() {
  const session = await requirePageSession("quotations:create");
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const appts = await db.appointment.findMany({
    where: {
      organizationId: session.orgId,
      assignedToId: session.userId,
      startAt: { gte: start, lt: new Date(start.getTime() + 7 * 86_400_000) },
      status: { in: ["SCHEDULED", "CHECKED_IN", "COMPLETED"] },
    },
    orderBy: { startAt: "asc" },
    include: { lead: { select: { id: true, name: true, phone: true, temperature: true, score: true, lat: true, lng: true, monthlyBill: true, recommendedKw: true, city: true } } },
  });
  return (
    <FieldApp
      name={session.name}
      appointments={appts.map((a) => ({
        id: a.id,
        type: a.type,
        status: a.status,
        startAt: a.startAt.toISOString(),
        endAt: a.endAt.toISOString(),
        address: a.address,
        notes: a.notes,
        checkInVerdict: a.checkInVerdict,
        checkInDistanceM: a.checkInDistanceM,
        lead: a.lead,
      }))}
    />
  );
}

import { addDays, startOfWeek } from "date-fns";
import type { Prisma } from "@prisma/client";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader, StatCard } from "@/components/ui";
import { WeekCalendar } from "@/components/appointments/week-calendar";
import { CalendarCheck2, CalendarX2, CheckCircle2, Link2 } from "lucide-react";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ week?: string; user?: string }> }) {
  const session = await requirePageSession();
  const sp = await searchParams;
  const base = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? new Date(`${sp.week}T00:00:00`) : new Date();
  const weekStart = startOfWeek(base, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const all = can(session.role, "leads:view_all");

  const where: Prisma.AppointmentWhereInput = { organizationId: session.orgId, startAt: { gte: weekStart, lt: weekEnd } };
  if (!all) where.assignedToId = session.userId;
  else if (sp.user) where.assignedToId = sp.user;

  const [appts, users] = await Promise.all([
    db.appointment.findMany({
      where,
      orderBy: { startAt: "asc" },
      include: { lead: { select: { id: true, name: true, phone: true, city: true } }, assignedTo: { select: { id: true, name: true, avatarColor: true } } },
    }),
    all
      ? db.user.findMany({ where: { organizationId: session.orgId, active: true, role: { in: ["FIELD_SALES", "SALES_MANAGER", "TELECALLER", "INSTALLER"] } }, select: { id: true, name: true, avatarColor: true, googleRefreshToken: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);
  const scheduled = appts.filter((a) => a.status === "SCHEDULED").length;
  const done = appts.filter((a) => a.status === "COMPLETED").length;
  const noShow = appts.filter((a) => a.status === "NO_SHOW").length;
  const synced = appts.filter((a) => a.googleEventId).length;

  return (
    <div>
      <PageHeader title="Appointments" subtitle="Site visits, quotation meetings and installations — synced to each salesperson's Google Calendar." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Scheduled this week" value={scheduled} icon={<CalendarCheck2 className="h-4 w-4" />} tone="blue" />
        <StatCard label="Completed" value={done} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" />
        <StatCard label="No-shows" value={noShow} icon={<CalendarX2 className="h-4 w-4" />} tone={noShow ? "red" : "slate"} hint="Reminders run 24h & 2h before" />
        <StatCard label="On Google Calendar" value={`${synced}/${appts.length}`} icon={<Link2 className="h-4 w-4" />} tone="violet" hint={all ? `${users.filter((u) => u.googleRefreshToken).length} of ${users.length} users connected` : undefined} />
      </div>
      <WeekCalendar
        weekStart={weekStart.toISOString()}
        userFilter={sp.user ?? null}
        users={users.map(({ googleRefreshToken: _g, ...u }) => u)}
        appointments={appts.map((a) => ({
          id: a.id, type: a.type, status: a.status, startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString(), address: a.address, notes: a.notes,
          googleEventId: a.googleEventId, googleSyncError: a.googleSyncError, checkInVerdict: a.checkInVerdict, lead: a.lead, assignedTo: a.assignedTo,
        }))}
      />
    </div>
  );
}

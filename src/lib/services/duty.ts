import { db } from "@/lib/db";

export interface DutySegment {
  onAt: string;
  offAt: string | null;
}

export interface DutySummary {
  userId: string;
  name: string;
  avatarColor: string;
  onDuty: boolean;
  totalOnDutyMs: number;
  segments: DutySegment[];
  permissionDenials: number;
}

export interface DutyEvent {
  id: string;
  userId: string;
  name: string;
  type: string;
  createdAt: string;
}

/** Pairs ON_DUTY/OFF_DUTY events into segments per user and tallies PERMISSION_DENIED events,
 *  so managers can tell "rep went off duty" apart from "rep's location permission was revoked". */
export async function dutyHistory(organizationId: string, opts: { days: number; userId?: string }): Promise<{ events: DutyEvent[]; summary: DutySummary[] }> {
  const since = new Date(Date.now() - opts.days * 86_400_000);
  const [users, events] = await Promise.all([
    db.user.findMany({
      where: { organizationId, active: true, role: { in: ["FIELD_SALES", "SALES_MANAGER"] }, ...(opts.userId ? { id: opts.userId } : {}) },
      select: { id: true, name: true, avatarColor: true },
      orderBy: { name: "asc" },
    }),
    db.locationStatusEvent.findMany({
      where: { organizationId, createdAt: { gte: since }, ...(opts.userId ? { userId: opts.userId } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true, type: true, createdAt: true },
    }),
  ]);

  const now = Date.now();
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const summary: DutySummary[] = users.map((u) => {
    const mine = events.filter((e) => e.userId === u.id);
    const segments: DutySegment[] = [];
    let openedAt: Date | null = null;
    let permissionDenials = 0;
    for (const e of mine) {
      if (e.type === "ON_DUTY") openedAt = openedAt ?? e.createdAt;
      else if (e.type === "OFF_DUTY" && openedAt) {
        segments.push({ onAt: openedAt.toISOString(), offAt: e.createdAt.toISOString() });
        openedAt = null;
      } else if (e.type === "PERMISSION_DENIED") permissionDenials++;
    }
    if (openedAt) segments.push({ onAt: openedAt.toISOString(), offAt: null });
    const totalOnDutyMs = segments.reduce((sum, s) => sum + ((s.offAt ? new Date(s.offAt).getTime() : now) - new Date(s.onAt).getTime()), 0);
    return { userId: u.id, name: u.name, avatarColor: u.avatarColor, onDuty: segments.some((s) => s.offAt === null), totalOnDutyMs, segments, permissionDenials };
  });

  return {
    events: events.map((e) => ({ id: e.id, userId: e.userId, name: nameById.get(e.userId) ?? "", type: e.type, createdAt: e.createdAt.toISOString() })),
    summary,
  };
}

import "server-only";
import { db } from "../db";
import type { Session } from "../session";
import { leadScope } from "./leads";

const FUNNEL = ["NEW", "CONTACTED", "QUALIFIED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "QUOTATION_SENT", "NEGOTIATION", "WON"] as const;

export async function dashboardStats(session: Session) {
  const scope = leadScope(session);
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday.getTime() + 86_400_000);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);
  const open = { stage: { notIn: ["WON", "LOST", "DISQUALIFIED"] as ("WON" | "LOST" | "DISQUALIFIED")[] } };

  // Performance: the 13 separate lead counts/aggregates this page used to run are now one scan of
  // the few columns they need, tallied in memory below. On a remote database that's one round
  // trip instead of many (the connection pool otherwise queues them).
  const orgWide = !scope.OR;
  const [leadRows, visitsToday, flagged, staleHot, users, quotesByUser, wonByUserScoped, upcoming] = await Promise.all([
    db.lead.findMany({
      where: scope,
      select: {
        stage: true, temperature: true, source: true, createdAt: true, updatedAt: true, wonAt: true, nextFollowUpAt: true,
        estimatedCost: true, dealValue: true, recommendedKw: true, assignedToId: true,
      },
    }),
    db.appointment.count({
      where: { organizationId: session.orgId, startAt: { gte: startToday, lt: endToday }, status: { not: "CANCELLED" }, ...(scope.OR ? { assignedToId: session.userId } : {}) },
    }),
    db.quotation.count({ where: { organizationId: session.orgId, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) }, geoVerdict: { notIn: ["VERIFIED", "OFFICE_CREATED"] } } }),
    db.lead.findMany({
      where: { ...scope, ...open, temperature: "HOT", AND: [{ OR: [{ lastContactAt: { lt: twoDaysAgo } }, { lastContactAt: null }] }] },
      select: { id: true, name: true, code: true, lastContactAt: true, createdAt: true, assignedTo: { select: { name: true } } },
      take: 8,
      orderBy: { lastContactAt: "asc" },
    }),
    db.user.findMany({ where: { organizationId: session.orgId, active: true, role: { in: ["FIELD_SALES", "TELECALLER", "SALES_MANAGER"] } }, select: { id: true, name: true, avatarColor: true, role: true } }),
    db.quotation.groupBy({ by: ["createdById", "geoVerdict"], where: { organizationId: session.orgId, createdAt: { gte: since30 } }, _count: { _all: true } }),
    // The team leaderboard is org-wide; for org-wide viewers it comes from the scan instead.
    orgWide
      ? Promise.resolve(null)
      : db.lead.groupBy({ by: ["assignedToId"], where: { organizationId: session.orgId, stage: "WON", wonAt: { gte: since30 } }, _count: { _all: true }, _sum: { dealValue: true } }),
    db.appointment.findMany({
      where: { organizationId: session.orgId, startAt: { gte: now }, status: "SCHEDULED", ...(scope.OR ? { assignedToId: session.userId } : {}) },
      orderBy: { startAt: "asc" },
      take: 6,
      include: { lead: { select: { id: true, name: true, city: true, temperature: true } }, assignedTo: { select: { name: true, avatarColor: true } } },
    }),
  ]);

  const OPEN_EXCLUDED = new Set(["WON", "LOST", "DISQUALIFIED"]);
  const PIPELINE = new Set(["QUALIFIED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "QUOTATION_SENT", "NEGOTIATION"]);
  const trendFrom = new Date(now.getTime() - 13 * 86_400_000);
  let leadsToday = 0, leadsMonth = 0, hotOpen = 0, pipelineValue = 0, wonMonth = 0, wonValueMonth = 0, wonKwMonth = 0, closed30 = 0, won30 = 0, overdue = 0;
  const stageCount: Record<string, number> = {};
  const sourceCount = new Map<string, number>();
  const tempCount: Record<string, number> = {};
  const trendLeads: { createdAt: Date; stage: string }[] = [];
  const wonByUserMap = new Map<string | null, { count: number; value: number }>();
  for (const l of leadRows) {
    const isOpen = !OPEN_EXCLUDED.has(l.stage);
    stageCount[l.stage] = (stageCount[l.stage] ?? 0) + 1;
    if (l.createdAt >= startToday) leadsToday++;
    if (l.createdAt >= startMonth) leadsMonth++;
    if (l.createdAt >= since30) sourceCount.set(l.source, (sourceCount.get(l.source) ?? 0) + 1);
    if (l.createdAt >= trendFrom) trendLeads.push({ createdAt: l.createdAt, stage: l.stage });
    if (isOpen) {
      tempCount[l.temperature] = (tempCount[l.temperature] ?? 0) + 1;
      if (l.temperature === "HOT") hotOpen++;
      if (PIPELINE.has(l.stage)) pipelineValue += l.estimatedCost ?? 0;
      if (l.nextFollowUpAt && l.nextFollowUpAt < now) overdue++;
    }
    if (l.stage === "WON" && l.wonAt && l.wonAt >= startMonth) {
      wonMonth++;
      wonValueMonth += l.dealValue ?? 0;
      wonKwMonth += l.recommendedKw ?? 0;
    }
    if ((l.stage === "WON" || l.stage === "LOST") && l.updatedAt >= since30) {
      closed30++;
      if (l.stage === "WON") won30++;
    }
    if (orgWide && l.stage === "WON" && l.wonAt && l.wonAt >= since30) {
      const w = wonByUserMap.get(l.assignedToId) ?? { count: 0, value: 0 };
      w.count++;
      w.value += l.dealValue ?? 0;
      wonByUserMap.set(l.assignedToId, w);
    }
  }
  const wonByUser = wonByUserScoped ?? [...wonByUserMap].map(([assignedToId, w]) => ({ assignedToId, _count: { _all: w.count }, _sum: { dealValue: w.value } }));
  const sourceGroups = [...sourceCount].map(([source, n]) => ({ source, _count: { _all: n } }));
  const tempGroups = Object.entries(tempCount).map(([temperature, n]) => ({ temperature, _count: { _all: n } }));
  const pipelineAgg = { _sum: { estimatedCost: pipelineValue } };
  const wonAgg = { _sum: { dealValue: wonValueMonth, recommendedKw: wonKwMonth } };
  // Cumulative funnel: a lead at "Quotation sent" has also passed every earlier stage.
  const funnel = FUNNEL.map((s, i) => ({
    stage: s,
    count: FUNNEL.slice(i).reduce((a, k) => a + (stageCount[k] ?? 0), 0),
  }));

  // Bucket once in a single pass instead of re-filtering the whole 14-day lead list per day.
  const buckets = new Map<string, { leads: number; won: number }>();
  for (const l of trendLeads) {
    const key = l.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? { leads: 0, won: 0 };
    bucket.leads++;
    if (l.stage === "WON") bucket.won++;
    buckets.set(key, bucket);
  }
  const days: { date: string; leads: number; won: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = new Date(startToday.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    days.push({ date: key, leads: bucket?.leads ?? 0, won: bucket?.won ?? 0 });
  }

  const team = users
    .map((u) => {
      const q = quotesByUser.filter((x) => x.createdById === u.id);
      const quotes = q.reduce((a, b) => a + b._count._all, 0);
      const verified = q.filter((x) => x.geoVerdict === "VERIFIED").reduce((a, b) => a + b._count._all, 0);
      const field = q.filter((x) => x.geoVerdict !== "OFFICE_CREATED").reduce((a, b) => a + b._count._all, 0);
      const w = wonByUser.find((x) => x.assignedToId === u.id);
      return {
        ...u,
        quotes,
        verifiedPct: field ? Math.round((verified / field) * 100) : null,
        won: w?._count._all ?? 0,
        wonValue: w?._sum.dealValue ?? 0,
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue || b.quotes - a.quotes);

  return {
    kpis: {
      leadsToday,
      leadsMonth,
      hotOpen,
      visitsToday,
      pipelineValue: pipelineAgg._sum.estimatedCost ?? 0,
      wonMonth,
      wonValueMonth: wonAgg._sum.dealValue ?? 0,
      wonKwMonth: wonAgg._sum.recommendedKw ?? 0,
      conversionRate: closed30 ? Math.round((won30 / closed30) * 100) : 0,
      overdueFollowUps: overdue,
      flaggedQuotes: flagged,
    },
    funnel,
    sources: sourceGroups.map((g) => ({ source: g.source, count: g._count._all })).sort((a, b) => b.count - a.count),
    temperature: ["HOT", "WARM", "COLD"].map((t) => ({ temperature: t, count: tempGroups.find((g) => g.temperature === t)?._count._all ?? 0 })),
    staleHot: staleHot.map((l) => ({ ...l, days: Math.floor((now.getTime() - (l.lastContactAt ?? l.createdAt).getTime()) / 86_400_000) })),
    trend: days,
    team,
    upcoming,
  };
}

export type DashboardStats = Awaited<ReturnType<typeof dashboardStats>>;

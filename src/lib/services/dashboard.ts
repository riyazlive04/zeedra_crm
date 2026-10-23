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

  const [
    leadsToday, leadsMonth, hotOpen, visitsToday, pipelineAgg, wonMonth, wonAgg, closed30, won30, overdue, flagged,
    stageGroups, sourceGroups, tempGroups, staleHot, trendLeads, users, quotesByUser, wonByUser, upcoming,
  ] = await Promise.all([
    db.lead.count({ where: { ...scope, createdAt: { gte: startToday } } }),
    db.lead.count({ where: { ...scope, createdAt: { gte: startMonth } } }),
    db.lead.count({ where: { ...scope, ...open, temperature: "HOT" } }),
    db.appointment.count({
      where: { organizationId: session.orgId, startAt: { gte: startToday, lt: endToday }, status: { not: "CANCELLED" }, ...(scope.OR ? { assignedToId: session.userId } : {}) },
    }),
    db.lead.aggregate({ where: { ...scope, ...open, stage: { in: ["QUALIFIED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "QUOTATION_SENT", "NEGOTIATION"] } }, _sum: { estimatedCost: true } }),
    db.lead.count({ where: { ...scope, stage: "WON", wonAt: { gte: startMonth } } }),
    db.lead.aggregate({ where: { ...scope, stage: "WON", wonAt: { gte: startMonth } }, _sum: { dealValue: true, recommendedKw: true } }),
    db.lead.count({ where: { ...scope, stage: { in: ["WON", "LOST"] }, updatedAt: { gte: since30 } } }),
    db.lead.count({ where: { ...scope, stage: "WON", updatedAt: { gte: since30 } } }),
    db.lead.count({ where: { ...scope, ...open, nextFollowUpAt: { lt: now } } }),
    db.quotation.count({ where: { organizationId: session.orgId, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) }, geoVerdict: { notIn: ["VERIFIED", "OFFICE_CREATED"] } } }),
    db.lead.groupBy({ by: ["stage"], where: scope, _count: { _all: true } }),
    db.lead.groupBy({ by: ["source"], where: { ...scope, createdAt: { gte: since30 } }, _count: { _all: true } }),
    db.lead.groupBy({ by: ["temperature"], where: { ...scope, ...open }, _count: { _all: true } }),
    db.lead.findMany({
      where: { ...scope, ...open, temperature: "HOT", OR: [{ lastContactAt: { lt: twoDaysAgo } }, { lastContactAt: null }] },
      select: { id: true, name: true, code: true, lastContactAt: true, createdAt: true, assignedTo: { select: { name: true } } },
      take: 8,
      orderBy: { lastContactAt: "asc" },
    }),
    db.lead.findMany({ where: { ...scope, createdAt: { gte: new Date(now.getTime() - 13 * 86_400_000) } }, select: { createdAt: true, stage: true } }),
    db.user.findMany({ where: { organizationId: session.orgId, active: true, role: { in: ["FIELD_SALES", "TELECALLER", "SALES_MANAGER"] } }, select: { id: true, name: true, avatarColor: true, role: true } }),
    db.quotation.groupBy({ by: ["createdById", "geoVerdict"], where: { organizationId: session.orgId, createdAt: { gte: since30 } }, _count: { _all: true } }),
    db.lead.groupBy({ by: ["assignedToId"], where: { organizationId: session.orgId, stage: "WON", wonAt: { gte: since30 } }, _count: { _all: true }, _sum: { dealValue: true } }),
    db.appointment.findMany({
      where: { organizationId: session.orgId, startAt: { gte: now }, status: "SCHEDULED", ...(scope.OR ? { assignedToId: session.userId } : {}) },
      orderBy: { startAt: "asc" },
      take: 6,
      include: { lead: { select: { id: true, name: true, city: true, temperature: true } }, assignedTo: { select: { name: true, avatarColor: true } } },
    }),
  ]);

  const stageCount = Object.fromEntries(stageGroups.map((g) => [g.stage, g._count._all]));
  // Cumulative funnel: a lead at "Quotation sent" has also passed every earlier stage.
  const funnel = FUNNEL.map((s, i) => ({
    stage: s,
    count: FUNNEL.slice(i).reduce((a, k) => a + (stageCount[k] ?? 0), 0),
  }));

  const days: { date: string; leads: number; won: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(startToday.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const sameDay = trendLeads.filter((l) => l.createdAt >= d && l.createdAt < new Date(d.getTime() + 86_400_000));
    days.push({ date: key, leads: sameDay.length, won: sameDay.filter((l) => l.stage === "WON").length });
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

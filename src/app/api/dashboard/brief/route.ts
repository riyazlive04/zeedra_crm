import { route } from "@/lib/api";
import { aiDailyBrief, aiEnabled, describeAiError } from "@/lib/ai";
import { dashboardStats } from "@/lib/services/dashboard";
import { ApiError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { formatINRCompact } from "@/lib/text";

export const POST = route("reports:view", async ({ session }) => {
  const stats = await dashboardStats(session);
  const compact = {
    leadsToday: stats.kpis.leadsToday,
    leadsThisMonth: stats.kpis.leadsMonth,
    hotOpen: stats.kpis.hotOpen,
    siteVisitsToday: stats.kpis.visitsToday,
    pipelineValue: formatINRCompact(stats.kpis.pipelineValue),
    wonThisMonth: stats.kpis.wonMonth,
    wonValueThisMonth: formatINRCompact(stats.kpis.wonValueMonth),
    conversionRatePct: stats.kpis.conversionRate,
    overdueFollowUps: stats.kpis.overdueFollowUps,
    flaggedQuotations7d: stats.kpis.flaggedQuotes,
    staleHotLeads: stats.staleHot.map((l) => ({ name: l.name, daysSinceContact: l.days })),
    funnel: stats.funnel,
    sources: stats.sources.slice(0, 5),
    team: stats.team.map((t) => ({ name: t.name, won: t.won, quotes: t.quotes, verifiedPct: t.verifiedPct })),
  };
  if (!aiEnabled()) {
    const lines = [
      `- ${compact.leadsToday} new leads today, ${compact.hotOpen} hot leads open, pipeline ${compact.pipelineValue}.`,
      compact.staleHotLeads.length ? `- ⚠ ${compact.staleHotLeads.length} hot leads not contacted in 2+ days: ${compact.staleHotLeads.slice(0, 3).map((l) => l.name).join(", ")}.` : "- ✅ Every hot lead was contacted in the last 2 days.",
      compact.overdueFollowUps ? `- ${compact.overdueFollowUps} follow-ups are overdue — clear them before noon.` : "- No overdue follow-ups.",
      compact.flaggedQuotations7d ? `- ${compact.flaggedQuotations7d} quotations failed GPS/time validation this week — review in Field Tracking.` : "- All field quotations this week passed location checks.",
      `- ${compact.siteVisitsToday} site visits scheduled today; ${compact.wonThisMonth} deals won this month (${compact.wonValueThisMonth}).`,
    ];
    return { brief: lines.join("\n"), source: "rules" };
  }
  await rateLimit(`ai-brief:${session.orgId}`, 30, 3600);
  try {
    return { brief: await aiDailyBrief(compact), source: "ai" };
  } catch (e) {
    throw new ApiError(502, describeAiError(e));
  }
});

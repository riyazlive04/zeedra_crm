import { route, orgSettings } from "@/lib/api";
import { db } from "@/lib/db";
import { getLeadForSession } from "@/lib/services/leads";
import { aiEnabled, aiLeadInsight, describeAiError, type LeadInsight } from "@/lib/ai";
import { basicQualification, salesScore } from "@/lib/qualification";
import { sizeSystem } from "@/lib/solar/sizing";
import { loanPlan } from "@/lib/solar/finance";
import { formatINR, humanize } from "@/lib/text";
import { logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

/** Deterministic coaching used when no AI key is configured — still genuinely useful. */
function ruleInsight(lead: Awaited<ReturnType<typeof getLeadForSession>>, s: Awaited<ReturnType<typeof orgSettings>>): LeadInsight {
  const basic = basicQualification(lead, s);
  const score = salesScore(lead, s, basic);
  const sz = lead.monthlyBill || lead.monthlyUnits ? sizeSystem({ monthlyBill: lead.monthlyBill, monthlyUnits: lead.monthlyUnits, segment: lead.segment, roofAreaSqft: lead.roofAreaSqft }, s) : null;
  const loan = sz ? loanPlan(sz.netCost, sz.monthlySavings, s.loanRatePct, s.loanTenureMonths, s.loanDownPaymentPct) : null;
  const first = lead.name.split(" ")[0];
  return {
    summary: sz
      ? `${lead.name} (${humanize(lead.segment)}) pays about ${formatINR(lead.monthlyBill ?? sz.monthlyUnits * s.tariffPerUnit)}/month. A ${sz.recommendedKw} kW system costs ${formatINR(sz.netCost)} after ${formatINR(sz.subsidy)} subsidy and saves ~${formatINR(sz.monthlySavings)}/month (payback ${sz.paybackYears} yrs).`
      : `${lead.name} has not shared electricity bill details yet — sizing and pricing cannot be computed.`,
    temperatureRationale: `${score.temperature} at ${score.score}/100: ${score.breakdown.filter((b) => b.points !== 0).map((b) => `${b.label} (${b.points > 0 ? "+" : ""}${b.points})`).join(", ") || "not enough data"}.`,
    nextBestAction: score.nextActions[0] ?? "Call the customer and confirm the site-visit date.",
    objectionHandling:
      lead.objection && lead.objection !== "NONE"
        ? score.nextActions.find((a) => a.length > 60) ?? "Address the objection with numbers from the proposal."
        : "No objection captured yet — ask: 'What would stop you from going solar this month?'",
    whatsappMessage: sz
      ? `Hi ${first}, for your ${formatINR(lead.monthlyBill ?? 0)} monthly bill a ${sz.recommendedKw} kW rooftop system fits well ☀️ Net cost after PM Surya Ghar subsidy is ${formatINR(sz.netCost)}, saving ~${formatINR(sz.monthlySavings)} every month.${loan ? ` EMI option from ${formatINR(loan.emi)}/month.` : ""} Can we do a free site survey this week?`
      : `Hi ${first}, thanks for your interest in rooftop solar ☀️ Could you share a photo of your latest electricity bill? I'll send you the exact system size, subsidy and savings.`,
    riskFlags: [...basic.reasons, ...basic.warnings, ...(sz?.warnings ?? [])],
  };
}

export const POST = route<{ id: string }>(null, async ({ session, params }) => {
  const lead = await getLeadForSession(session, params.id);
  const s = await orgSettings(session.orgId);

  let insight: LeadInsight;
  let source: "ai" | "rules" = "rules";
  if (aiEnabled()) {
    await rateLimit(`ai:${session.orgId}`, 120, 3600);
    const [recent, messages] = await Promise.all([
      db.activity.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" }, take: 15, select: { type: true, title: true, body: true, createdAt: true } }),
      db.whatsAppMessage.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" }, take: 10, select: { direction: true, body: true, createdAt: true } }),
    ]);
    const basic = basicQualification(lead, s);
    const score = salesScore(lead, s, basic);
    const sz = lead.monthlyBill || lead.monthlyUnits ? sizeSystem({ monthlyBill: lead.monthlyBill, monthlyUnits: lead.monthlyUnits, segment: lead.segment, roofAreaSqft: lead.roofAreaSqft, sanctionedLoadKw: lead.sanctionedLoadKw, phase: lead.phase }, s) : null;
    const { id: _id, organizationId: _o, scoreBreakdown: _sb, aiSummary: _a, aiNextAction: _n, ...leadData } = lead;
    void _id, _o, _sb, _a, _n;
    try {
      insight = await aiLeadInsight({
        lead: leadData,
        basicQualification: basic,
        salesScore: score,
        sizing: sz,
        loan: sz ? loanPlan(sz.netCost, sz.monthlySavings, s.loanRatePct, s.loanTenureMonths, s.loanDownPaymentPct) : null,
        recentActivity: recent,
        recentWhatsApp: messages.reverse(),
        today: new Date().toISOString(),
      });
      source = "ai";
    } catch (e) {
      throw new ApiError(502, describeAiError(e));
    }
  } else {
    insight = ruleInsight(lead, s);
  }

  await db.lead.update({ where: { id: lead.id }, data: { aiSummary: insight.summary, aiNextAction: insight.nextBestAction, aiUpdatedAt: new Date() } });
  await logActivity({ orgId: session.orgId, leadId: lead.id, userId: session.userId, type: "AI", title: "AI insight generated", body: insight.nextBestAction });
  return { insight, source };
});

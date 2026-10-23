import "server-only";
import { Prisma, type Lead } from "@prisma/client";
import { format } from "date-fns";
import { db } from "../db";
import { parseSettings } from "../settings";
import { sizeSystem } from "../solar/sizing";
import { loanPlan } from "../solar/finance";
import { formatINR } from "../text";
import { sendWhatsApp } from "../whatsapp";
import { logActivity, notify } from "../activity";
import { evaluateConditions, type Action, type Condition, type Trigger } from "./types";

type LeadWithUser = Lead & { assignedTo?: { name: string; phone: string | null } | null };

/** Variables available to every WhatsApp template ({{name}}, {{kw}}, {{savings}} …). */
export async function leadTemplateVars(lead: LeadWithUser, extra: Record<string, string | number | null | undefined> = {}) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: lead.organizationId } });
  const s = parseSettings(org.settings);
  const sizing = sizeSystem(
    {
      monthlyBill: lead.monthlyBill,
      monthlyUnits: lead.monthlyUnits,
      segment: lead.segment,
      roofAreaSqft: lead.roofAreaSqft,
      sanctionedLoadKw: lead.sanctionedLoadKw,
      phase: lead.phase,
    },
    s,
  );
  const loan = loanPlan(sizing.netCost, sizing.monthlySavings, s.loanRatePct, s.loanTenureMonths, s.loanDownPaymentPct);
  const assignee =
    lead.assignedTo ??
    (lead.assignedToId ? await db.user.findUnique({ where: { id: lead.assignedToId }, select: { name: true, phone: true } }) : null);
  return {
    name: lead.name.split(" ")[0],
    fullName: lead.name,
    company: org.name,
    companyPhone: org.phone ?? "",
    leadCode: lead.code,
    city: lead.city ?? "",
    bill: lead.monthlyBill ? formatINR(lead.monthlyBill) : "",
    units: sizing.monthlyUnits,
    kw: sizing.recommendedKw,
    panels: sizing.panelCount,
    panelWattage: sizing.panelWattage,
    cost: formatINR(sizing.totalCost),
    subsidy: formatINR(sizing.subsidy),
    netCost: formatINR(sizing.netCost),
    savings: formatINR(sizing.monthlySavings),
    annualSavings: formatINR(sizing.annualSavings),
    payback: sizing.paybackYears,
    emi: formatINR(loan.emi),
    loanTenure: Math.round(s.loanTenureMonths / 12),
    salesperson: assignee?.name ?? org.name,
    salespersonPhone: assignee?.phone ?? org.phone ?? "",
    ...extra,
  };
}

export interface FireContext {
  orgId: string;
  leadId?: string | null;
  /** Unique reference for idempotency (e.g. appointment id). Defaults to leadId + timestamp for events. */
  refKey?: string;
  extra?: Record<string, unknown>;
  vars?: Record<string, string | number | null | undefined>;
}

/**
 * Runs every active rule for this trigger whose conditions match. Failures are recorded but never
 * thrown — automations must not break the user action that triggered them.
 */
export async function fireTrigger(trigger: Trigger, ctx: FireContext): Promise<number> {
  const rules = await db.automationRule.findMany({ where: { organizationId: ctx.orgId, trigger, active: true } });
  if (!rules.length) return 0;

  const lead = ctx.leadId
    ? await db.lead.findFirst({
        where: { id: ctx.leadId, organizationId: ctx.orgId },
        include: { assignedTo: { select: { name: true, phone: true } } },
      })
    : null;
  const evalCtx: Record<string, unknown> = { ...(lead ?? {}), ...(ctx.extra ?? {}) };
  let ran = 0;

  for (const rule of rules) {
    if (!evaluateConditions((rule.conditions as unknown as Condition[]) ?? [], evalCtx)) continue;
    const refKey = ctx.refKey ?? `${ctx.leadId ?? "org"}:${Date.now()}`;
    try {
      await db.automationRun.create({ data: { ruleId: rule.id, refKey } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // already ran
      throw e;
    }
    const errors: string[] = [];
    for (const action of (rule.actions as unknown as Action[]) ?? []) {
      try {
        await runAction(action, ctx, lead, rule.name);
      } catch (e) {
        errors.push(`${action.type}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    ran++;
    await db.automationRule.update({ where: { id: rule.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } });
    if (errors.length)
      await db.automationRun.update({
        where: { ruleId_refKey: { ruleId: rule.id, refKey } },
        data: { status: "ERROR", detail: errors.join("; ").slice(0, 1000) },
      });
    if (lead)
      await logActivity({
        orgId: ctx.orgId,
        leadId: lead.id,
        type: "AUTOMATION",
        title: `Automation: ${rule.name}`,
        body: errors.length ? `Completed with errors — ${errors.join("; ")}` : undefined,
      });
  }
  return ran;
}

async function runAction(action: Action, ctx: FireContext, lead: LeadWithUser | null, ruleName: string) {
  switch (action.type) {
    case "SEND_WHATSAPP": {
      if (!lead) throw new Error("No lead in context");
      if (!lead.whatsappOptIn) return;
      const vars = await leadTemplateVars(lead, ctx.vars);
      const r = await sendWhatsApp({
        orgId: ctx.orgId,
        phone: lead.phone,
        templateKey: action.templateKey,
        vars,
        leadId: lead.id,
        automated: true,
      });
      if (r.status === "FAILED") throw new Error(r.error ?? "WhatsApp send failed");
      return;
    }
    case "CREATE_TASK": {
      await db.task.create({
        data: {
          organizationId: ctx.orgId,
          leadId: lead?.id,
          assignedToId: lead?.assignedToId,
          title: lead ? `${action.title} — ${lead.name}` : action.title,
          dueAt: new Date(Date.now() + action.dueInHours * 3_600_000),
          priority: action.priority ?? "NORMAL",
        },
      });
      return;
    }
    case "NOTIFY_ASSIGNEE": {
      if (lead?.assignedToId)
        await notify(ctx.orgId, lead.assignedToId, action.title, `${lead.name} · ${lead.code}`, `/leads/${lead.id}`);
      return;
    }
    case "NOTIFY_MANAGERS": {
      const managers = await db.user.findMany({
        where: { organizationId: ctx.orgId, active: true, role: { in: ["OWNER", "ADMIN", "SALES_MANAGER"] } },
        select: { id: true },
      });
      const href = typeof ctx.extra?.href === "string" ? ctx.extra.href : lead ? `/leads/${lead.id}` : undefined;
      await Promise.all(
        managers.map((m) => notify(ctx.orgId, m.id, action.title, lead ? `${lead.name} · ${lead.code} (${ruleName})` : ruleName, href)),
      );
      return;
    }
    case "SET_FOLLOW_UP": {
      if (lead) await db.lead.update({ where: { id: lead.id }, data: { nextFollowUpAt: new Date(Date.now() + action.inHours * 3_600_000) } });
      return;
    }
  }
}

/**
 * Time-based automations. Called by /api/cron/run every 5–15 minutes from an external scheduler.
 * Each rule's delayMinutes is the look-ahead / inactivity threshold; AutomationRun keeps it idempotent.
 */
export async function runScheduledAutomations(now = new Date()) {
  const summary: Record<string, number> = { reminders: 0, noResponse: 0, expiring: 0, expired: 0 };

  const reminderRules = await db.automationRule.findMany({ where: { trigger: "APPOINTMENT_REMINDER", active: true } });
  for (const rule of reminderRules) {
    const horizon = new Date(now.getTime() + rule.delayMinutes * 60_000);
    const appts = await db.appointment.findMany({
      where: { organizationId: rule.organizationId, status: "SCHEDULED", startAt: { gt: now, lte: horizon } },
      include: { assignedTo: { select: { name: true, phone: true } } },
    });
    for (const a of appts) {
      summary.reminders += await fireTrigger("APPOINTMENT_REMINDER", {
        orgId: rule.organizationId,
        leadId: a.leadId,
        refKey: `appt:${a.id}:${rule.delayMinutes}`,
        extra: { appointmentType: a.type },
        vars: {
          date: format(a.startAt, "EEE, d MMM"),
          time: format(a.startAt, "h:mm a"),
          salesperson: a.assignedTo.name,
          salespersonPhone: a.assignedTo.phone ?? "",
        },
      });
    }
  }

  const staleRules = await db.automationRule.findMany({ where: { trigger: "NO_RESPONSE", active: true } });
  for (const rule of staleRules) {
    const cutoff = new Date(now.getTime() - rule.delayMinutes * 60_000);
    const leads = await db.lead.findMany({
      where: {
        organizationId: rule.organizationId,
        stage: { notIn: ["WON", "LOST", "DISQUALIFIED"] },
        OR: [{ lastContactAt: { lt: cutoff } }, { lastContactAt: null, createdAt: { lt: cutoff } }],
      },
      select: { id: true, lastContactAt: true, createdAt: true },
      take: 500,
    });
    for (const l of leads) {
      const since = (l.lastContactAt ?? l.createdAt).toISOString();
      summary.noResponse += await fireTrigger("NO_RESPONSE", { orgId: rule.organizationId, leadId: l.id, refKey: `stale:${l.id}:${since}` });
    }
  }

  const expiringRules = await db.automationRule.findMany({ where: { trigger: "QUOTATION_EXPIRING", active: true } });
  for (const rule of expiringRules) {
    const horizon = new Date(now.getTime() + rule.delayMinutes * 60_000);
    const quotes = await db.quotation.findMany({
      where: { organizationId: rule.organizationId, status: "SENT", validUntil: { gt: now, lte: horizon } },
      select: { id: true, leadId: true, number: true, validUntil: true },
    });
    for (const q of quotes) {
      summary.expiring += await fireTrigger("QUOTATION_EXPIRING", {
        orgId: rule.organizationId,
        leadId: q.leadId,
        refKey: `qexp:${q.id}`,
        vars: { quoteNumber: q.number, validUntil: format(q.validUntil, "d MMM yyyy") },
      });
    }
  }

  const expired = await db.quotation.updateMany({
    where: { status: { in: ["DRAFT", "SENT"] }, validUntil: { lt: now } },
    data: { status: "EXPIRED" },
  });
  summary.expired = expired.count;

  // Housekeeping: drop rate-limit windows and old idempotency rows.
  await db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
  await db.automationRun.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } } });
  return summary;
}

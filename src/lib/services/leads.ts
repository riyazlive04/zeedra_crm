import "server-only";
import type { Lead, LeadStage, Prisma } from "@prisma/client";
import { db } from "../db";
import { parseSettings, type OrgSettings } from "../settings";
import { basicQualification, salesScore } from "../qualification";
import { sizeSystem } from "../solar/sizing";
import { normalizePhone, humanize } from "../text";
import { nextLeadCode } from "../counter";
import { logActivity, notify } from "../activity";
import { fireTrigger } from "../automation/engine";
import { ApiError } from "../errors";
import { can, isScopedRole } from "../rbac";
import type { Session } from "../session";
import { SEGMENTS, SOURCES, STAGES, type LeadCreateInput } from "../validators";

/** Prisma where-clause limiting which leads a user may see. */
export function leadScope(session: Session): Prisma.LeadWhereInput {
  const base: Prisma.LeadWhereInput = { organizationId: session.orgId };
  if (!isScopedRole(session.role)) return base;
  return {
    ...base,
    OR: [{ assignedToId: session.userId }, { appointments: { some: { assignedToId: session.userId } } }],
  };
}

// PostgreSQL `contains` is case-sensitive unless mode is set; SQLite is already case-insensitive
// for ASCII and rejects the `mode` option, so it is only added on Postgres.
const ci = (process.env.DATABASE_URL ?? "").startsWith("postgres") ? { mode: "insensitive" as const } : {};

/** Translates list filters from the query string into a scoped where-clause. */
export function leadListWhere(q: URLSearchParams, session: Session): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { ...leadScope(session) };
  const and: Prisma.LeadWhereInput[] = [];

  const stage = q.get("stage");
  if (stage && (STAGES as readonly string[]).includes(stage)) where.stage = stage as Prisma.LeadWhereInput["stage"];
  const temp = q.get("temperature");
  if (temp && ["HOT", "WARM", "COLD"].includes(temp)) where.temperature = temp as "HOT";
  const source = q.get("source");
  if (source && (SOURCES as readonly string[]).includes(source)) where.source = source as "WEBSITE";
  const segment = q.get("segment");
  if (segment && (SEGMENTS as readonly string[]).includes(segment)) where.segment = segment as "RESIDENTIAL";
  const assigned = q.get("assignedToId");
  if (assigned && can(session.role, "leads:view_all")) where.assignedToId = assigned === "none" ? null : assigned;
  if (q.get("open") === "1") and.push({ stage: { notIn: ["WON", "LOST", "DISQUALIFIED"] } });
  if (q.get("followUpDue") === "1") and.push({ nextFollowUpAt: { lte: new Date() }, stage: { notIn: ["WON", "LOST", "DISQUALIFIED"] } });
  const search = q.get("q")?.trim();
  if (search) {
    const digits = search.replace(/\D/g, "");
    and.push({
      OR: [
        { name: { contains: search, ...ci } },
        { code: { contains: search.toUpperCase() } },
        { city: { contains: search, ...ci } },
        { address: { contains: search, ...ci } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
      ],
    });
  }
  if (and.length) where.AND = and;
  return where;
}

export async function getLeadForSession(session: Session, id: string) {
  const lead = await db.lead.findFirst({ where: { id, ...leadScope(session) } });
  if (!lead) throw new ApiError(404, "Lead not found");
  return lead;
}

async function pickAssignee(orgId: string, s: OrgSettings): Promise<string | null> {
  if (s.autoAssign === "NONE") return null;
  // First touch goes to tele-callers when the company has them, otherwise to field sales.
  for (const role of ["TELECALLER", "FIELD_SALES"] as const) {
    const users = await db.user.findMany({
      where: { organizationId: orgId, role, active: true },
      select: { id: true, _count: { select: { assignedLeads: { where: { stage: { notIn: ["WON", "LOST", "DISQUALIFIED"] } } } } } },
      orderBy: { createdAt: "asc" },
    });
    if (!users.length) continue;
    if (s.autoAssign === "LEAST_LOADED") return users.sort((a, b) => a._count.assignedLeads - b._count.assignedLeads)[0].id;
    // Round-robin: whoever received a lead least recently.
    const last = await db.lead.findMany({
      where: { organizationId: orgId, assignedToId: { in: users.map((u) => u.id) } },
      orderBy: { createdAt: "desc" },
      select: { assignedToId: true },
      take: users.length * 3,
    });
    // Rank = position in the most-recent-first list; users who never got a lead rank last (best).
    const order = last.map((l) => l.assignedToId);
    const rank = (id: string) => (order.indexOf(id) === -1 ? 1e9 : order.indexOf(id));
    return users.map((u) => u.id).sort((a, b) => rank(b) - rank(a))[0];
  }
  return null;
}

/** Recomputes qualification, score, temperature and sizing; fires automations on changes. */
export async function requalify(leadId: string, actorId?: string | null): Promise<Lead> {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  const org = await db.organization.findUniqueOrThrow({ where: { id: lead.organizationId }, select: { settings: true } });
  const s = parseSettings(org.settings);

  const basic = basicQualification(lead, s);
  const score = salesScore(lead, s, basic);
  const hasEnergyData = Boolean(lead.monthlyBill || lead.monthlyUnits);
  const sizing = hasEnergyData
    ? sizeSystem(
        {
          monthlyBill: lead.monthlyBill,
          monthlyUnits: lead.monthlyUnits,
          segment: lead.segment,
          roofAreaSqft: lead.roofAreaSqft,
          sanctionedLoadKw: lead.sanctionedLoadKw,
          phase: lead.phase,
        },
        s,
      )
    : null;

  const basicQualified = basic.status === "INCOMPLETE" ? null : basic.status === "QUALIFIED";
  let stage: LeadStage = lead.stage;
  if (basic.status === "DISQUALIFIED" && ["NEW", "CONTACTED", "QUALIFIED"].includes(lead.stage)) stage = "DISQUALIFIED";
  if (basic.status === "QUALIFIED" && ["NEW", "CONTACTED", "DISQUALIFIED"].includes(lead.stage)) stage = "QUALIFIED";

  const updated = await db.lead.update({
    where: { id: lead.id },
    data: {
      basicQualified,
      basicCheckReason: [...basic.reasons, ...basic.warnings].join(" ") || null,
      score: score.score,
      temperature: score.temperature,
      scoreBreakdown: { breakdown: score.breakdown, nextActions: score.nextActions, missing: basic.missing } as unknown as Prisma.InputJsonValue,
      recommendedKw: sizing?.recommendedKw ?? null,
      estimatedCost: sizing?.totalCost ?? null,
      subsidyAmount: sizing?.subsidy ?? null,
      stage,
    },
  });

  if (lead.basicQualified !== basicQualified && basicQualified !== null) {
    await logActivity({
      orgId: lead.organizationId,
      leadId: lead.id,
      userId: actorId,
      type: "QUALIFICATION",
      title: basicQualified ? "Passed basic qualification" : "Failed basic qualification",
      body: basicQualified ? basic.warnings.join(" ") || null : basic.reasons.join(" "),
    });
    await fireTrigger(basicQualified ? "LEAD_QUALIFIED" : "LEAD_DISQUALIFIED", {
      orgId: lead.organizationId,
      leadId: lead.id,
      refKey: `basic:${lead.id}:${basicQualified}`,
    });
  }
  if (lead.temperature !== score.temperature) {
    await logActivity({
      orgId: lead.organizationId,
      leadId: lead.id,
      userId: actorId,
      type: "QUALIFICATION",
      title: `Temperature ${humanize(lead.temperature)} → ${humanize(score.temperature)} (score ${score.score})`,
    });
    await fireTrigger("TEMPERATURE_CHANGED", {
      orgId: lead.organizationId,
      leadId: lead.id,
      refKey: `temp:${lead.id}:${score.temperature}:${Date.now()}`,
      extra: { previousTemperature: lead.temperature },
    });
  }
  if (lead.stage !== stage) await onStageChanged(updated, lead.stage, actorId);
  return updated;
}

export async function onStageChanged(lead: Lead, from: LeadStage, actorId?: string | null) {
  await logActivity({
    orgId: lead.organizationId,
    leadId: lead.id,
    userId: actorId,
    type: "STAGE_CHANGE",
    title: `Stage ${humanize(from)} → ${humanize(lead.stage)}`,
  });
  await fireTrigger("STAGE_CHANGED", {
    orgId: lead.organizationId,
    leadId: lead.id,
    refKey: `stage:${lead.id}:${lead.stage}:${Date.now()}`,
    extra: { previousStage: from },
  });
}

export async function changeStage(session: Session, leadId: string, stage: LeadStage, opts: { lostReason?: string | null; dealValue?: number | null } = {}) {
  const lead = await getLeadForSession(session, leadId);
  if (lead.stage === stage) return lead;
  if (stage === "LOST" && !opts.lostReason) throw new ApiError(400, "Please record why the lead was lost");
  const updated = await db.lead.update({
    where: { id: lead.id },
    data: {
      stage,
      lostReason: stage === "LOST" ? opts.lostReason : lead.lostReason,
      wonAt: stage === "WON" ? new Date() : lead.wonAt,
      dealValue: stage === "WON" ? (opts.dealValue ?? lead.dealValue ?? lead.estimatedCost) : lead.dealValue,
    },
  });
  await onStageChanged(updated, lead.stage, session.userId);
  return updated;
}

export interface CreateLeadResult {
  lead: Lead;
  duplicate: boolean;
}

/**
 * Creates a lead from any channel (form, API, CSV, WhatsApp). De-duplicates by phone within the
 * organisation: a repeat enquiry is logged on the existing lead instead of creating a clone.
 */
export async function createLead(orgId: string, input: LeadCreateInput, actorId?: string | null): Promise<CreateLeadResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new ApiError(400, "Invalid mobile number");

  const existing = await db.lead.findFirst({ where: { organizationId: orgId, phone } });
  if (existing) {
    await logActivity({
      orgId,
      leadId: existing.id,
      userId: actorId,
      type: "SYSTEM",
      title: `Repeat enquiry via ${humanize(input.source ?? "OTHER")}`,
      body: input.campaign ? `Campaign: ${input.campaign}` : undefined,
    });
    if (existing.assignedToId)
      await notify(orgId, existing.assignedToId, "Existing lead enquired again", `${existing.name} · ${existing.code}`, `/leads/${existing.id}`);
    return { lead: existing, duplicate: true };
  }

  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { settings: true } });
  const s = parseSettings(org.settings);
  let assignedToId = input.assignedToId ?? null;
  if (assignedToId) {
    const ok = await db.user.count({ where: { id: assignedToId, organizationId: orgId, active: true } });
    if (!ok) assignedToId = null;
  }
  assignedToId ??= await pickAssignee(orgId, s);

  const { assignedToId: _ignored, phone: _p, ...rest } = input;
  void _ignored;
  void _p;
  const lead = await db.lead.create({
    data: {
      ...rest,
      organizationId: orgId,
      code: await nextLeadCode(orgId),
      phone,
      altPhone: input.altPhone ? normalizePhone(input.altPhone) : null,
      state: input.state ?? s.state,
      assignedToId,
      createdById: actorId ?? null,
      sitePinned: false,
    },
  });

  await logActivity({
    orgId,
    leadId: lead.id,
    userId: actorId,
    type: "SYSTEM",
    title: `Lead created from ${humanize(lead.source)}`,
  });
  if (assignedToId) {
    await notify(orgId, assignedToId, "New lead assigned to you", `${lead.name} · ${lead.city ?? ""}`, `/leads/${lead.id}`);
  }
  await fireTrigger("LEAD_CREATED", { orgId, leadId: lead.id, refKey: `created:${lead.id}` });
  const final = await requalify(lead.id, actorId);
  return { lead: final, duplicate: false };
}

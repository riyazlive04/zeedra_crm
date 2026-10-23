import "server-only";
import type { Prisma, ProjectStage } from "@prisma/client";
import { db } from "../db";
import { nextProjectCode } from "../counter";
import { logActivity } from "../activity";
import { fireTrigger } from "../automation/engine";
import { PROJECT_STAGES } from "../defaults";
import type { Session } from "../session";

/** When a deal is won, open the installation project (idempotent). */
export async function createProjectForLead(session: Session, leadId: string) {
  const existing = await db.project.findUnique({ where: { leadId } });
  if (existing) return existing;
  const lead = await db.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { quotations: { where: { status: { in: ["ACCEPTED", "SENT"] } }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const q = lead.quotations[0];
  const project = await db.project.create({
    data: {
      organizationId: lead.organizationId,
      leadId,
      code: await nextProjectCode(lead.organizationId),
      systemKw: q?.systemKw ?? lead.recommendedKw ?? 0,
      contractValue: lead.dealValue ?? q?.totalAmount ?? lead.estimatedCost ?? 0,
      managerId: session.userId,
      stageHistory: [{ stage: "BOOKING_CONFIRMED", at: new Date().toISOString(), by: session.name }] as Prisma.InputJsonValue,
      checklist: {},
    },
  });
  if (q && q.status !== "ACCEPTED") await db.quotation.update({ where: { id: q.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
  await logActivity({ orgId: lead.organizationId, leadId, userId: session.userId, type: "SYSTEM", title: `Installation project ${project.code} opened` });
  return project;
}

export async function moveProjectStage(session: Session, projectId: string, stage: ProjectStage) {
  const p = await db.project.findFirstOrThrow({ where: { id: projectId, organizationId: session.orgId } });
  if (p.stage === stage) return p;
  const history = Array.isArray(p.stageHistory) ? (p.stageHistory as Prisma.JsonArray) : [];
  const label = PROJECT_STAGES.find((s) => s.key === stage)?.label ?? stage;
  const updated = await db.project.update({
    where: { id: p.id },
    data: {
      stage,
      stageHistory: [...history, { stage, at: new Date().toISOString(), by: session.name }] as Prisma.InputJsonValue,
      ...(stage === "INSTALLATION" && !p.installDate ? { installDate: new Date() } : {}),
      ...(stage === "COMMISSIONED" ? { commissionedAt: new Date() } : {}),
    },
  });
  await logActivity({ orgId: session.orgId, leadId: p.leadId, userId: session.userId, type: "SYSTEM", title: `Project ${p.code}: ${label}` });
  await fireTrigger("PROJECT_STAGE_CHANGED", {
    orgId: session.orgId,
    leadId: p.leadId,
    refKey: `proj:${p.id}:${stage}`,
    extra: { projectStage: stage },
    vars: { projectStage: label, projectCode: p.code },
  });
  return updated;
}

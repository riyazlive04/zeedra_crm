import { z } from "zod";
import type { Prisma, ProjectStage } from "@prisma/client";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { moveProjectStage } from "@/lib/services/projects";
import { PROJECT_STAGES } from "@/lib/defaults";
import { logActivity } from "@/lib/activity";

const stageKeys = PROJECT_STAGES.map((s) => s.key) as [string, ...string[]];

const schema = z.object({
  stage: z.enum(stageKeys).optional(),
  checklist: z.record(z.string(), z.boolean()).optional(),
  amountReceived: z.number().min(0).optional(),
  portalAppId: z.string().max(60).nullable().optional(),
  netMeterNo: z.string().max(60).nullable().optional(),
  installDate: z.coerce.date().nullable().optional(),
  managerId: z.string().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export const PATCH = route<{ id: string }>("projects:manage", async ({ req, session, params }) => {
  const body = await parseBody(req, schema);
  const p = await db.project.findFirst({ where: { id: params.id, organizationId: session.orgId } });
  if (!p) throw new ApiError(404, "Project not found");
  if (session.role === "INSTALLER" && p.managerId !== session.userId) throw new ApiError(403, "Not your project");
  if (body.amountReceived != null && body.amountReceived > p.contractValue * 1.2) throw new ApiError(400, "Amount received exceeds contract value");

  const { stage, checklist, managerId, ...rest } = body;
  const data: Prisma.ProjectUpdateInput = { ...rest };
  if (managerId && !(await db.user.count({ where: { id: managerId, organizationId: session.orgId } }))) throw new ApiError(400, "User not found");
  if (managerId !== undefined) data.manager = managerId ? { connect: { id: managerId } } : { disconnect: true };
  if (checklist) data.checklist = { ...((p.checklist as Record<string, boolean>) ?? {}), ...checklist };
  await db.project.update({ where: { id: p.id }, data });
  if (body.amountReceived != null && body.amountReceived !== p.amountReceived)
    await logActivity({ orgId: session.orgId, leadId: p.leadId, userId: session.userId, type: "SYSTEM", title: `Payment updated: ₹${body.amountReceived.toLocaleString("en-IN")} received` });
  if (stage) await moveProjectStage(session, p.id, stage as ProjectStage);
  return db.project.findUniqueOrThrow({ where: { id: p.id } });
});

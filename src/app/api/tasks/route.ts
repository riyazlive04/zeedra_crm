import { z } from "zod";
import { route, parseBody, searchParams } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { ApiError } from "@/lib/errors";

export const GET = route(null, async ({ req, session }) => {
  const q = searchParams(req);
  const mine = q.get("mine") !== "0" || !can(session.role, "leads:view_all");
  return db.task.findMany({
    where: { organizationId: session.orgId, done: q.get("done") === "1", ...(mine ? { assignedToId: session.userId } : {}) },
    orderBy: [{ dueAt: "asc" }],
    take: 200,
    include: { lead: { select: { id: true, name: true, code: true, phone: true } }, assignedTo: { select: { name: true } } },
  });
});

const createSchema = z.object({
  title: z.string().trim().min(2).max(200),
  dueAt: z.coerce.date(),
  leadId: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
});

export const POST = route(null, async ({ req, session }) => {
  const body = await parseBody(req, createSchema);
  if (body.leadId && !(await db.lead.count({ where: { id: body.leadId, organizationId: session.orgId } }))) throw new ApiError(400, "Lead not found");
  const assignee = can(session.role, "leads:assign") ? (body.assignedToId ?? session.userId) : session.userId;
  return db.task.create({ data: { ...body, assignedToId: assignee, organizationId: session.orgId } });
});

const patchSchema = z.object({ id: z.string(), done: z.boolean() });

export const PATCH = route(null, async ({ req, session }) => {
  const body = await parseBody(req, patchSchema);
  const t = await db.task.findFirst({ where: { id: body.id, organizationId: session.orgId } });
  if (!t) throw new ApiError(404, "Task not found");
  if (t.assignedToId !== session.userId && !can(session.role, "leads:assign")) throw new ApiError(403, "Not your task");
  return db.task.update({ where: { id: t.id }, data: { done: body.done, doneAt: body.done ? new Date() : null } });
});

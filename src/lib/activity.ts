import "server-only";
import type { ActivityType, Prisma } from "@prisma/client";
import { db } from "./db";

export async function logActivity(a: {
  orgId: string;
  leadId?: string | null;
  userId?: string | null;
  type: ActivityType;
  title: string;
  body?: string | null;
  meta?: Prisma.InputJsonValue;
}) {
  return db.activity.create({
    data: {
      organizationId: a.orgId,
      leadId: a.leadId ?? null,
      userId: a.userId ?? null,
      type: a.type,
      title: a.title,
      body: a.body ?? null,
      meta: a.meta,
    },
  });
}

export async function audit(a: {
  orgId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  return db.auditLog.create({
    data: {
      organizationId: a.orgId,
      userId: a.userId ?? null,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId ?? null,
      meta: a.meta,
      ip: a.ip ?? null,
    },
  });
}

export async function notify(orgId: string, userId: string, title: string, body?: string, href?: string) {
  return db.notification.create({ data: { organizationId: orgId, userId, title, body, href } });
}

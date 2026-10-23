import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/activity";
import { billingState, isPlanId, PLANS } from "@/lib/billing/plans";

function requireOwner(role: string) {
  if (role !== "OWNER") throw new ApiError(403, "Only the workspace owner can manage billing");
}

export const GET = route("settings:manage", async ({ session }) => {
  requireOwner(session.role);
  const org = await db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { plan: true, billingStatus: true, trialEndsAt: true, subscribedAt: true } });
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const [seats, leadsThisMonth] = await Promise.all([
    db.user.count({ where: { organizationId: session.orgId, active: true } }),
    db.lead.count({ where: { organizationId: session.orgId, createdAt: { gte: startOfMonth } } }),
  ]);
  const b = billingState(org);
  return {
    plan: b.plan,
    billingStatus: b.billingStatus,
    trialEndsAt: org.trialEndsAt,
    trialDaysLeft: b.trialDaysLeft,
    trialExpired: b.trialExpired,
    subscribedAt: org.subscribedAt,
    usage: { seats, seatLimit: b.plan.seatLimit, leadsThisMonth, leadLimitMonthly: b.plan.leadLimitMonthly },
    plans: Object.values(PLANS),
  };
});

const upgradeSchema = z.object({ plan: z.string() });

export const POST = route("settings:manage", async ({ req, session }) => {
  requireOwner(session.role);
  const body = await parseBody(req, upgradeSchema);
  if (!isPlanId(body.plan)) throw new ApiError(400, "Unknown plan");
  await db.organization.update({ where: { id: session.orgId }, data: { plan: body.plan, billingStatus: "ACTIVE", subscribedAt: new Date() } });
  await audit({ orgId: session.orgId, userId: session.userId, action: "upgrade", entity: "billing", meta: { plan: body.plan } });
  return { ok: true };
});

const cancelSchema = z.object({ cancel: z.literal(true) });

export const DELETE = route("settings:manage", async ({ req, session }) => {
  requireOwner(session.role);
  await parseBody(req, cancelSchema);
  await db.organization.update({ where: { id: session.orgId }, data: { billingStatus: "CANCELED" } });
  await audit({ orgId: session.orgId, userId: session.userId, action: "cancel", entity: "billing" });
  return { ok: true };
});

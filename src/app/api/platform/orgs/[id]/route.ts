import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { errorResponse, parseBody } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/activity";
import { requirePlatformApi } from "@/lib/platform";
import { PLAN_ORDER } from "@/lib/billing/plans";

const schema = z.object({
  plan: z.enum(PLAN_ORDER as [string, ...string[]]).optional(),
  billingStatus: z.enum(["TRIALING", "ACTIVE", "CANCELED"]).optional(),
  /** Add days to the trial (from today if it already ended). */
  extendTrialDays: z.number().int().min(1).max(365).optional(),
  suspended: z.boolean().optional(),
  suspendedReason: z.string().trim().max(300).optional().nullable(),
});

/** Change a client's plan, billing status, trial, or suspend / reactivate them. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePlatformApi();
    const { id } = await ctx.params;
    const org = await db.organization.findUnique({ where: { id }, select: { id: true, trialEndsAt: true, billingStatus: true } });
    if (!org) throw new ApiError(404, "Company not found");
    const input = await parseBody(req, schema);
    if (input.suspended && org.id === admin.orgId) throw new ApiError(400, "You can't suspend your own company");
    const data: Record<string, unknown> = {};
    if (input.plan) data.plan = input.plan;
    if (input.billingStatus) {
      data.billingStatus = input.billingStatus;
      if (input.billingStatus === "ACTIVE" && org.billingStatus !== "ACTIVE") data.subscribedAt = new Date();
    }
    if (input.extendTrialDays) {
      const from = org.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date();
      data.trialEndsAt = new Date(from.getTime() + input.extendTrialDays * 86_400_000);
      if (!input.billingStatus && org.billingStatus !== "ACTIVE") data.billingStatus = "TRIALING";
    }
    if (input.suspended !== undefined) {
      data.suspendedAt = input.suspended ? new Date() : null;
      data.suspendedReason = input.suspended ? (input.suspendedReason ?? null) : null;
    }
    const updated = await db.organization.update({ where: { id }, data, select: { id: true, plan: true, billingStatus: true, trialEndsAt: true, suspendedAt: true } });
    await audit({ orgId: id, userId: null, action: "platform.update_org", entity: "organization", entityId: id, meta: { by: admin.email, ...input } });
    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

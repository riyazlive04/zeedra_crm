import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { errorResponse, parseBody } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/activity";
import { requirePlatformApi } from "@/lib/platform";
import { provisionOrganization } from "@/lib/services/tenant";
import { PLAN_ORDER } from "@/lib/billing/plans";
import { normalizePhone } from "@/lib/text";

const createSchema = z.object({
  orgName: z.string().trim().min(2, "Enter the company name").max(120),
  ownerName: z.string().trim().min(2, "Enter the owner's name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().max(20).optional().nullable(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  plan: z.enum(PLAN_ORDER as [string, ...string[]]).default("GROWTH"),
  billingStatus: z.enum(["TRIALING", "ACTIVE"]).default("TRIALING"),
  trialDays: z.number().int().min(1).max(365).default(14),
});

/** Create a client company with its owner account (same starter data as self sign-up). */
export async function POST(req: NextRequest) {
  try {
    const admin = await requirePlatformApi();
    const input = await parseBody(req, createSchema);
    if (await db.user.findUnique({ where: { email: input.email } })) throw new ApiError(409, "Someone already uses this email. Pick another for the owner.");
    const { org, owner } = await provisionOrganization(db, {
      orgName: input.orgName,
      ownerName: input.ownerName,
      email: input.email,
      phone: input.phone ? normalizePhone(input.phone) : null,
      password: input.password,
    });
    await db.organization.update({
      where: { id: org.id },
      data: {
        plan: input.plan,
        billingStatus: input.billingStatus,
        trialEndsAt: input.billingStatus === "TRIALING" ? new Date(Date.now() + input.trialDays * 86_400_000) : null,
        subscribedAt: input.billingStatus === "ACTIVE" ? new Date() : null,
      },
    });
    await audit({ orgId: org.id, userId: null, action: "platform.create_org", entity: "organization", entityId: org.id, meta: { by: admin.email, plan: input.plan, owner: owner.email } });
    return NextResponse.json({ id: org.id, ownerEmail: owner.email }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

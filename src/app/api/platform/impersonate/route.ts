import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, errorResponse, parseBody } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/activity";
import { createSessionCookie } from "@/lib/auth";
import { requirePlatformApi } from "@/lib/platform";

const schema = z.object({ orgId: z.string().min(1) });

/**
 * "View as": signs the platform admin in as the client's owner for up to 2 hours, so they can
 * see exactly what the client sees and help. The session remembers who the admin is, the app
 * shows a banner, and every start is recorded in the client's audit log.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requirePlatformApi();
    const { orgId } = await parseBody(req, schema);
    const owner = await db.user.findFirst({ where: { organizationId: orgId, role: "OWNER" }, select: { id: true, organizationId: true, role: true, name: true, email: true } });
    if (!owner) throw new ApiError(404, "This company has no owner account");
    await createSessionCookie({ userId: owner.id, orgId: owner.organizationId, role: owner.role, name: owner.name, email: owner.email, imp: { adminId: admin.userId, adminName: admin.name } });
    await audit({ orgId, userId: null, action: "platform.view_as", entity: "user", entityId: owner.id, meta: { by: admin.email }, ip: clientIp(req) });
    return NextResponse.json({ ok: true, home: "/dashboard" });
  } catch (e) {
    return errorResponse(e);
  }
}

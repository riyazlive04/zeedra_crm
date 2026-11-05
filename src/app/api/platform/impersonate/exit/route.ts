import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/activity";
import { createSessionCookie, getSession } from "@/lib/auth";
import { platformAdminEmails } from "@/lib/platform";

/** End "View as" and sign back in as the platform admin who started it. */
export async function POST() {
  try {
    const s = await getSession();
    if (!s?.imp) throw new ApiError(400, "You're not viewing as a client");
    const admin = await db.user.findUnique({ where: { id: s.imp.adminId }, select: { id: true, organizationId: true, role: true, name: true, email: true, active: true } });
    // Re-check: the admin must still be active and still on the platform list.
    if (!admin?.active || !platformAdminEmails().includes(admin.email.toLowerCase())) throw new ApiError(403, "Please sign in again");
    await createSessionCookie({ userId: admin.id, orgId: admin.organizationId, role: admin.role, name: admin.name, email: admin.email });
    await audit({ orgId: s.orgId, userId: null, action: "platform.view_as_end", entity: "user", entityId: s.userId, meta: { by: admin.email } });
    return NextResponse.json({ ok: true, home: "/platform" });
  } catch (e) {
    return errorResponse(e);
  }
}

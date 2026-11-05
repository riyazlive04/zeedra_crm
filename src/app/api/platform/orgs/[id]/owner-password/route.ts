import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { errorResponse, parseBody } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/activity";
import { hashPassword } from "@/lib/auth";
import { requirePlatformApi } from "@/lib/platform";

const schema = z.object({ password: z.string().min(8, "Password must be at least 8 characters").max(200) });

/** Set a new password for a client's owner (they forgot it). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePlatformApi();
    const { id } = await ctx.params;
    const { password } = await parseBody(req, schema);
    const owner = await db.user.findFirst({ where: { organizationId: id, role: "OWNER" }, select: { id: true, email: true } });
    if (!owner) throw new ApiError(404, "This company has no owner account");
    await db.user.update({ where: { id: owner.id }, data: { passwordHash: await hashPassword(password), active: true } });
    await audit({ orgId: id, userId: null, action: "platform.reset_owner_password", entity: "user", entityId: owner.id, meta: { by: admin.email } });
    return NextResponse.json({ ok: true, email: owner.email });
  } catch (e) {
    return errorResponse(e);
  }
}

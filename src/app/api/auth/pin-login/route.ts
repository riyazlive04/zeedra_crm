import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSessionCookie, verifyPassword, hashPassword } from "@/lib/auth";
import { clientIp, errorResponse, parseBody } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/activity";
import { ApiError } from "@/lib/errors";

let dummyHash: Promise<string> | null = null;

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  pin: z.string().regex(/^\d{4,6}$/, "4-6 digit PIN"),
  deviceId: z.string().trim().max(100).optional(),
});

/**
 * A quick alternate credential alongside the usual email+password login, for field staff
 * signing in on a device they use often. A PIN is much shorter than a password, so this route
 * is rate-limited far tighter than /api/auth/login.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, pin, deviceId } = await parseBody(req, schema);
    const ip = clientIp(req);
    await rateLimit(`pin-login:ip:${ip}`, 15, 900);
    await rateLimit(`pin-login:email:${email}`, 5, 900);

    const user = await db.user.findUnique({ where: { email } });
    // Always run bcrypt to keep timing uniform whether or not the user/PIN exists.
    const ok = await verifyPassword(pin, user?.pinHash ?? (await (dummyHash ??= hashPassword("timing-equaliser"))));
    if (!user || !user.pinHash || !ok) throw new ApiError(401, "Incorrect email or PIN");
    if (!user.active) throw new ApiError(403, "Your account is deactivated. Contact your administrator.");

    await createSessionCookie({ userId: user.id, orgId: user.organizationId, role: user.role, name: user.name, email: user.email });
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastPinLoginAt: new Date(), lastPinDeviceId: deviceId ?? null } });
    await audit({ orgId: user.organizationId, userId: user.id, action: "login", entity: "user", entityId: user.id, ip, meta: { via: "pin", deviceId } });
    return NextResponse.json({ ok: true, role: user.role, home: user.role === "FIELD_SALES" ? "/field" : user.role === "INSTALLER" ? "/projects" : "/dashboard" });
  } catch (e) {
    return errorResponse(e);
  }
}

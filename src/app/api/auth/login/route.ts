import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSessionCookie, verifyPassword } from "@/lib/auth";
import { clientIp, errorResponse, parseBody } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/activity";
import { ApiError } from "@/lib/errors";
import { hashPassword } from "@/lib/auth";

let dummyHash: Promise<string> | null = null;

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await parseBody(req, schema);
    const ip = clientIp(req);
    await rateLimit(`login:ip:${ip}`, 30, 900);
    await rateLimit(`login:email:${email}`, 8, 900);

    const user = await db.user.findUnique({ where: { email } });
    // Always run bcrypt to keep timing uniform whether or not the user exists.
    const ok = await verifyPassword(password, user?.passwordHash ?? (await (dummyHash ??= hashPassword("timing-equaliser"))));
    if (!user || !ok) throw new ApiError(401, "Incorrect email or password");
    if (!user.active) throw new ApiError(403, "Your account is deactivated. Contact your administrator.");

    await createSessionCookie({ userId: user.id, orgId: user.organizationId, role: user.role, name: user.name, email: user.email });
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({ orgId: user.organizationId, userId: user.id, action: "login", entity: "user", entityId: user.id, ip });
    return NextResponse.json({ ok: true, role: user.role, home: user.role === "FIELD_SALES" ? "/field" : user.role === "INSTALLER" ? "/projects" : "/dashboard" });
  } catch (e) {
    return errorResponse(e);
  }
}

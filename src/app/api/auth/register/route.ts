import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";
import { clientIp, errorResponse, parseBody } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { provisionOrganization } from "@/lib/services/tenant";
import { ApiError } from "@/lib/errors";
import { normalizePhone } from "@/lib/text";

const schema = z.object({
  orgName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(10).max(20),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200)
    .regex(/[A-Za-z]/, "Password needs a letter")
    .regex(/\d/, "Password needs a number"),
  state: z.string().trim().max(60).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await parseBody(req, schema);
    await rateLimit(`register:${clientIp(req)}`, 5, 3600);
    if (await db.user.findUnique({ where: { email: body.email } })) throw new ApiError(409, "An account with this email already exists");
    const phone = normalizePhone(body.phone);
    if (!phone) throw new ApiError(400, "Enter a valid mobile number");

    const { owner } = await provisionOrganization(db, {
      orgName: body.orgName,
      ownerName: body.name,
      email: body.email,
      phone,
      password: body.password,
      settings: body.state ? { state: body.state } : undefined,
    });
    await createSessionCookie({ userId: owner.id, orgId: owner.organizationId, role: owner.role, name: owner.name, email: owner.email });
    return NextResponse.json({ ok: true, home: "/dashboard?welcome=1" });
  } catch (e) {
    return errorResponse(e);
  }
}

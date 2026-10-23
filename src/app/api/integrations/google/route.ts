import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { googleAuthUrl, googleConfigured } from "@/lib/google-calendar";
import { route } from "@/lib/api";

/** GET → redirects to Google consent. GET ?code=… (callback) is handled at /callback. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  if (!session) return NextResponse.redirect(`${base}/login`);
  if (!googleConfigured()) return NextResponse.redirect(`${base}/settings?tab=integrations&google=not_configured`);
  return NextResponse.redirect(await googleAuthUrl(session.userId));
}

export const DELETE = route(null, async ({ session }) => {
  await db.user.update({ where: { id: session.userId }, data: { googleRefreshToken: null, googleEmail: null } });
  return { ok: true };
});

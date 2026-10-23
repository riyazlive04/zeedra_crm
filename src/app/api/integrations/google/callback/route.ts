import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { exchangeCode, verifyGoogleState } from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const back = (q: string) => NextResponse.redirect(`${base}/settings?tab=integrations&google=${q}`);
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back("denied");

  const session = await getSession();
  const uid = await verifyGoogleState(p.get("state") ?? "");
  if (!session || !uid || uid !== session.userId) return back("invalid_state");

  try {
    const { refreshToken, email } = await exchangeCode(p.get("code") ?? "");
    if (!refreshToken) return back("no_refresh_token");
    await db.user.update({ where: { id: session.userId }, data: { googleRefreshToken: refreshToken, googleEmail: email ?? null, googleCalendarId: "primary" } });
    return back("connected");
  } catch {
    return back("error");
  }
}

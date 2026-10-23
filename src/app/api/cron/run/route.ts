import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { runScheduledAutomations } from "@/lib/automation/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : (req.nextUrl.searchParams.get("secret") ?? "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Call every 5–15 minutes from Vercel Cron, GitHub Actions, cron-job.org or a system crontab. */
async function handler(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const summary = await runScheduledAutomations();
  return NextResponse.json({ ok: true, ...summary, ms: Date.now() - started });
}

export { handler as GET, handler as POST };

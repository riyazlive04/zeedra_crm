import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/ai";
import { googleConfigured } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    // Reports only whether required secrets are configured — never their values.
    const config = {
      authSecret: (process.env.AUTH_SECRET?.length ?? 0) >= 32,
      cronSecret: Boolean(process.env.CRON_SECRET),
      appUrl: Boolean(process.env.APP_URL),
    };
    const ready = config.authSecret;
    return NextResponse.json(
      { status: ready ? "ok" : "misconfigured", db: "up", config, ai: aiEnabled(), googleCalendar: googleConfigured(), time: new Date().toISOString() },
      { status: ready ? 200 : 503 },
    );
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}

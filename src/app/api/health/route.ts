import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/ai";
import { googleConfigured } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up", ai: aiEnabled(), googleCalendar: googleConfigured(), time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}

import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { orgSettings } from "@/lib/api";
import { PageHeader, StatCard } from "@/components/ui";
import { TrackingBoard } from "@/components/field/tracking-board";
import { ShieldCheck, ShieldAlert, MapPinned, Users } from "lucide-react";

export const metadata = { title: "Field Tracking" };

export default async function TrackingPage({ searchParams }: { searchParams: Promise<{ quote?: string }> }) {
  const session = await requirePageSession("tracking:view");
  const { quote } = await searchParams;
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);

  const [users, pings, quotes, checkIns, settings] = await Promise.all([
    db.user.findMany({ where: { organizationId: session.orgId, active: true, role: "FIELD_SALES" }, select: { id: true, name: true, avatarColor: true, territory: true }, orderBy: { name: "asc" } }),
    db.locationPing.findMany({
      where: { organizationId: session.orgId, createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
      orderBy: { createdAt: "asc" },
      select: { userId: true, lat: true, lng: true, createdAt: true, source: true },
    }),
    db.quotation.findMany({
      where: { organizationId: session.orgId, createdAt: { gte: since30 } },
      orderBy: { serverTime: "desc" },
      take: 300,
      select: {
        id: true, number: true, geoVerdict: true, serverTime: true, distanceFromSiteM: true, capturedLat: true, capturedLng: true, netCost: true, reviewNote: true,
        createdBy: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, lat: true, lng: true } },
      },
    }),
    db.appointment.count({ where: { organizationId: session.orgId, checkInAt: { gte: startToday } } }),
    orgSettings(session.orgId),
  ]);

  const team = users.map((u) => {
    const mine = pings.filter((p) => p.userId === u.id);
    const q = quotes.filter((x) => x.createdBy.id === u.id && x.geoVerdict !== "OFFICE_CREATED");
    const last = mine[mine.length - 1];
    return {
      ...u,
      last: last ? { lat: last.lat, lng: last.lng, createdAt: last.createdAt.toISOString(), source: last.source } : null,
      trail: mine.filter((p) => p.createdAt >= startToday).map((p) => ({ lat: p.lat, lng: p.lng, createdAt: p.createdAt.toISOString() })),
      stats: { quotes: q.length, verified: q.filter((x) => x.geoVerdict === "VERIFIED").length, flagged: q.filter((x) => x.geoVerdict !== "VERIFIED").length, checkIns: 0 },
    };
  });
  const field = quotes.filter((q) => q.geoVerdict !== "OFFICE_CREATED");
  const verified = field.filter((q) => q.geoVerdict === "VERIFIED").length;
  const activeNow = team.filter((t) => t.last && Date.now() - new Date(t.last.createdAt).getTime() < 30 * 60_000).length;

  return (
    <div>
      <PageHeader title="Field Tracking" subtitle="GPS + time validation of every visit and quotation. Server clock is authoritative; device clocks, geofence, slot and travel speed are cross-checked." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active now" value={`${activeNow}/${team.length}`} hint="Pinged in last 30 min" icon={<Users className="h-4 w-4" />} tone="blue" />
        <StatCard label="Check-ins today" value={checkIns} icon={<MapPinned className="h-4 w-4" />} />
        <StatCard label="Verified quotes (30d)" value={`${field.length ? Math.round((verified / field.length) * 100) : 0}%`} hint={`${verified} of ${field.length} field quotations`} icon={<ShieldCheck className="h-4 w-4" />} tone="green" />
        <StatCard label="Flagged (30d)" value={field.length - verified} hint="Need manager review" icon={<ShieldAlert className="h-4 w-4" />} tone={field.length - verified ? "red" : "green"} />
      </div>
      <TrackingBoard
        team={team}
        focusQuote={quote}
        geofenceM={settings.geofenceRadiusM}
        quotes={quotes.map((q) => ({ ...q, serverTime: q.serverTime.toISOString() }))}
      />
    </div>
  );
}

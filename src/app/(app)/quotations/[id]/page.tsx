import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeft, CheckCircle2, XCircle, Smartphone, Clock, MapPin, Eye } from "lucide-react";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { orgSettings } from "@/lib/api";
import { Card, CardHeader, Badge } from "@/components/ui";
import { VerdictBadge, VERDICT_META } from "@/components/badges";
import { ProposalDocument } from "@/components/quotes/proposal-document";
import { QuoteActions, ReviewValidation } from "@/components/quotes/quote-actions";
import { Map } from "@/components/map/map";
import { humanize, formatINR } from "@/lib/text";

export const metadata = { title: "Quotation" };

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession();
  const { id } = await params;
  // orgSettings only needs session.orgId, not the quotation, so fetch it alongside instead of after.
  const [q, s] = await Promise.all([
    db.quotation.findFirst({
      where: { id, organizationId: session.orgId },
      include: {
        lead: true,
        createdBy: { select: { id: true, name: true, phone: true } },
        appointment: { select: { startAt: true, endAt: true, type: true } },
        organization: true,
      },
    }),
    orgSettings(session.orgId),
  ]);
  if (!q) notFound();
  const reviewer = can(session.role, "quotations:review");
  const isOwner = q.createdById === session.userId || q.lead.assignedToId === session.userId;
  if (!reviewer && !isOwner) notFound();
  const geo = (q.geoFlags as { checks?: { key: string; label: string; passed: boolean; detail: string }[] } | null)?.checks ?? [];

  const rootId = q.parentId ?? q.id;
  const revisions = await db.quotation.findMany({
    where: { organizationId: session.orgId, OR: [{ id: rootId }, { parentId: rootId }] },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, totalAmount: true, supersededAt: true, createdAt: true },
  });
  const isLatest = !q.supersededAt;

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/quotations" className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
            <ChevronLeft className="h-3.5 w-3.5" /> Quotations
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold">{q.number}</h1>
            {q.version > 1 && <Badge tone="violet">Rev. {q.version}</Badge>}
            {!isLatest && <Badge tone="slate">Superseded</Badge>}
            <Badge tone={q.status === "ACCEPTED" ? "green" : q.status === "SENT" ? "amber" : q.status === "DRAFT" ? "slate" : "rose"}>{humanize(q.status)}</Badge>
            <VerdictBadge value={q.geoVerdict} />
            {q.viewedAt && (
              <Badge tone="sky">
                <Eye className="h-3 w-3" /> Viewed {format(q.viewedAt, "d MMM, h:mm a")}
              </Badge>
            )}
          </div>
          <Link href={`/leads/${q.leadId}`} className="text-sm text-slate-500 hover:text-sun-700">
            {q.lead.name} · {q.lead.code}
          </Link>
        </div>
        <QuoteActions id={q.id} status={q.status} shareToken={q.shareToken} canAccept={can(session.role, "leads:edit")} canRevise={isLatest && (reviewer || isOwner)} />
      </div>
      {!isLatest && (
        <div className="no-print rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This version was superseded by a later revision.{" "}
          <Link href={`/quotations/${revisions.find((r) => !r.supersededAt)?.id ?? q.id}`} className="font-semibold underline">
            View the current version
          </Link>
          .
        </div>
      )}

      <div className="grid gap-6 2xl:grid-cols-[1fr_380px]">
        <ProposalDocument
          q={{ ...q, lead: q.lead, org: q.organization, createdBy: q.createdBy }}
          escalationPct={s.tariffEscalationPct}
          degradationPct={s.degradationPct}
        />

        <div className="no-print space-y-4">
          {revisions.length > 1 && (
            <Card>
              <CardHeader title="Version history" subtitle={`${revisions.length} version${revisions.length > 1 ? "s" : ""} of ${q.number}`} />
              <ul className="divide-y divide-slate-100">
                {revisions.map((r) => (
                  <li key={r.id}>
                    <Link href={`/quotations/${r.id}`} className={`flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 ${r.id === q.id ? "bg-sun-50/40" : ""}`}>
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          Rev. {r.version} {!r.supersededAt && <span className="ml-1 text-[11px] font-medium text-emerald-700">Current</span>}
                        </div>
                        <div className="text-xs text-slate-500">{format(r.createdAt, "d MMM yyyy, h:mm a")}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums text-slate-800">{formatINR(r.totalAmount)}</div>
                        <div className="text-xs text-slate-500">{humanize(r.status)}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader
              title="Who · where · when"
              subtitle="Field validation evidence"
              action={reviewer && q.geoVerdict !== "OFFICE_CREATED" && <ReviewValidation id={q.id} hasCapture={q.capturedLat != null} reviewed={q.reviewNote} />}
            />
            <div className="space-y-3 p-4">
              <div className={`rounded-lg px-3 py-2 text-xs ${q.geoVerdict === "VERIFIED" ? "bg-emerald-50 text-emerald-800" : q.geoVerdict === "OFFICE_CREATED" ? "bg-slate-50 text-slate-600" : "bg-amber-50 text-amber-800"}`}>
                {VERDICT_META[q.geoVerdict]?.help}
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <Smartphone className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                  <div>
                    <dt className="text-slate-400">Created by</dt>
                    <dd className="font-medium text-slate-700">{q.createdBy.name}</dd>
                    {q.deviceInfo && <dd className="max-w-[18rem] truncate text-[11px] text-slate-400" title={q.deviceInfo}>{q.deviceInfo}</dd>}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                  <div>
                    <dt className="text-slate-400">Server time (authoritative)</dt>
                    <dd className="font-medium text-slate-700">{format(q.serverTime, "d MMM yyyy, h:mm:ss a")}</dd>
                    {q.deviceTime && <dd className="text-[11px] text-slate-400">Device clock: {format(q.deviceTime, "h:mm:ss a")}</dd>}
                    {q.appointment && (
                      <dd className="text-[11px] text-slate-400">
                        Slot: {humanize(q.appointment.type)} {format(q.appointment.startAt, "d MMM, h:mm")}–{format(q.appointment.endAt, "h:mm a")}
                      </dd>
                    )}
                  </div>
                </div>
                {q.capturedLat != null && (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                    <div>
                      <dt className="text-slate-400">Captured location</dt>
                      <dd className="font-medium text-slate-700">
                        {q.capturedLat.toFixed(5)}, {q.capturedLng?.toFixed(5)} (±{Math.round(q.capturedAccuracyM ?? 0)} m)
                      </dd>
                      {q.distanceFromSiteM != null && <dd className="text-[11px] text-slate-500">{q.distanceFromSiteM} m from the customer site</dd>}
                    </div>
                  </div>
                )}
              </dl>
              {geo.length > 0 && (
                <ul className="space-y-1">
                  {geo.map((c) => (
                    <li key={c.key} className="flex items-start gap-1.5 text-[11px]">
                      {c.passed ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />}
                      <span className="text-slate-600">
                        <b>{c.label}:</b> {c.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {q.capturedLat != null && q.capturedLng != null && (
                <Map
                  height={220}
                  markers={[
                    ...(q.lead.lat != null && q.lead.lng != null ? [{ id: "site", lat: q.lead.lat, lng: q.lead.lng, color: "#ea580c", label: "Customer site" }] : []),
                    { id: "cap", lat: q.capturedLat, lng: q.capturedLng, color: q.geoVerdict === "VERIFIED" ? "#16a34a" : "#dc2626", label: "Quote captured here", ring: true },
                  ]}
                  circles={q.lead.lat != null && q.lead.lng != null ? [{ lat: q.lead.lat, lng: q.lead.lng, radiusM: s.geofenceRadiusM }] : []}
                  lines={q.lead.lat != null && q.lead.lng != null ? [{ points: [[q.lead.lat, q.lead.lng], [q.capturedLat, q.capturedLng]], color: "#64748b", dashed: true }] : []}
                />
              )}
              {q.reviewNote && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Review: {q.reviewNote}</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

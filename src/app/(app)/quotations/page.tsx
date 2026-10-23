import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { Avatar, Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { VerdictBadge } from "@/components/badges";
import { formatINR, formatINRCompact, humanize } from "@/lib/text";

export const metadata = { title: "Quotations" };

const FILTERS = [
  ["", "All"],
  ["flagged", "⚠ Flagged"],
  ["SENT", "Sent"],
  ["ACCEPTED", "Accepted"],
  ["EXPIRED", "Expired"],
] as const;

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const session = await requirePageSession("quotations:create");
  const { f = "" } = await searchParams;
  const where: Prisma.QuotationWhereInput = { organizationId: session.orgId };
  if (!can(session.role, "quotations:review")) where.createdById = session.userId;
  const base = { ...where };
  if (f === "flagged") where.geoVerdict = { notIn: ["VERIFIED", "OFFICE_CREATED"] };
  else if (f) where.status = f as Prisma.QuotationWhereInput["status"];

  const [quotes, totals, flagged, accepted] = await Promise.all([
    db.quotation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { lead: { select: { id: true, name: true, code: true, city: true } }, createdBy: { select: { name: true, avatarColor: true } } },
    }),
    db.quotation.aggregate({ where: { ...base, status: { in: ["SENT", "DRAFT"] } }, _sum: { totalAmount: true, systemKw: true }, _count: true }),
    db.quotation.count({ where: { ...base, geoVerdict: { notIn: ["VERIFIED", "OFFICE_CREATED"] } } }),
    db.quotation.count({ where: { ...base, status: "ACCEPTED" } }),
  ]);
  const all = await db.quotation.count({ where: base });

  return (
    <div>
      <PageHeader title="Quotations" subtitle="Every proposal with who created it, where and when." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Open quotations" value={totals._count} hint={`${(totals._sum.systemKw ?? 0).toFixed(1)} kW`} icon={<FileText className="h-4 w-4" />} />
        <StatCard label="Open value" value={formatINRCompact(totals._sum.totalAmount ?? 0)} tone="violet" />
        <StatCard label="Acceptance rate" value={`${all ? Math.round((accepted / all) * 100) : 0}%`} tone="green" />
        <StatCard label="Failed validation" value={flagged} tone={flagged ? "red" : "green"} href="/quotations?f=flagged" />
      </div>
      <Card>
        <div className="flex gap-1 border-b border-slate-100 px-4 py-2.5">
          {FILTERS.map(([k, l]) => (
            <Link key={k} href={k ? `/quotations?f=${k}` : "/quotations"} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${f === k ? "bg-ink-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {l}
            </Link>
          ))}
        </div>
        {quotes.length === 0 ? (
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No quotations" body="Create one from a lead page or the Field App during a site visit." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-2.5">Quotation</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5 text-right">System</th>
                  <th className="px-3 py-2.5 text-right">Net cost</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Location check</th>
                  <th className="px-4 py-2.5">Created by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotes.map((q) => (
                  <tr key={q.id} className="hover:bg-sun-50/30">
                    <td className="px-4 py-3">
                      <Link href={`/quotations/${q.id}`} className="font-medium text-slate-900 hover:text-sun-700">
                        {q.number}
                      </Link>
                      <div className="text-xs text-slate-500">{format(q.serverTime, "d MMM yyyy, h:mm a")}</div>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/leads/${q.lead.id}`} className="hover:text-sun-700">
                        {q.lead.name}
                      </Link>
                      <div className="text-xs text-slate-500">{q.lead.city}</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{q.systemKw} kW</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">{formatINR(q.netCost)}</td>
                    <td className="px-3 py-3">
                      <Badge tone={q.status === "ACCEPTED" ? "green" : q.status === "SENT" ? "amber" : q.status === "DRAFT" ? "slate" : "rose"}>{humanize(q.status)}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <VerdictBadge value={q.geoVerdict} />
                      {q.distanceFromSiteM != null && <div className="mt-0.5 text-[11px] text-slate-400">{q.distanceFromSiteM} m from site</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={q.createdBy.name} color={q.createdBy.avatarColor} size={22} />
                        <span className="text-xs">{q.createdBy.name}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

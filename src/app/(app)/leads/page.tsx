import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { formatDistanceToNow, isPast } from "date-fns";
import { Users, ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { leadListWhere } from "@/lib/services/leads";
import { Avatar, ButtonLink, Card, EmptyState, PageHeader, Badge } from "@/components/ui";
import { StageBadge, TemperatureBadge } from "@/components/badges";
import { LeadFilters } from "@/components/leads/lead-filters";
import { displayPhone, formatINR, humanize } from "@/lib/text";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePageSession();
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 25;
  const where = leadListWhere(q, session);
  const sort = sp.sort ?? "recent";
  const orderBy: Prisma.LeadOrderByWithRelationInput[] =
    sort === "score" ? [{ score: "desc" }] : sort === "followup" ? [{ nextFollowUpAt: "asc" }] : sort === "bill" ? [{ monthlyBill: "desc" }] : [{ createdAt: "desc" }];

  const [total, leads, users] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { assignedTo: { select: { name: true, avatarColor: true } } },
    }),
    can(session.role, "leads:view_all")
      ? db.user.findMany({ where: { organizationId: session.orgId, active: true, role: { not: "INSTALLER" } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (p: number) => {
    const n = new URLSearchParams(q);
    n.set("page", String(p));
    return `/leads?${n.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={`${total.toLocaleString("en-IN")} ${total === 1 ? "lead" : "leads"}${q.toString() ? " match your filters" : ""}`}
        actions={
          can(session.role, "leads:edit") && (
            <ButtonLink href="/leads/new" variant="primary">
              + New lead
            </ButtonLink>
          )
        }
      />
      <Card>
        <LeadFilters users={users} canImport={can(session.role, "leads:import")} canExport={can(session.role, "reports:view")} />
        {leads.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No leads found" body="Try clearing filters, import a CSV, or connect your website form." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Lead</th>
                    <th className="px-3 py-2.5">Temperature</th>
                    <th className="px-3 py-2.5">Stage</th>
                    <th className="px-3 py-2.5 text-right">EB bill</th>
                    <th className="px-3 py-2.5 text-right">System</th>
                    <th className="px-3 py-2.5">Source</th>
                    <th className="px-3 py-2.5">Follow-up</th>
                    <th className="px-4 py-2.5">Owner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((l) => (
                    <tr key={l.id} className="group hover:bg-sun-50/30">
                      <td className="px-4 py-3">
                        <Link href={`/leads/${l.id}`} className="block">
                          <div className="font-medium text-slate-900 group-hover:text-sun-700">{l.name}</div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span className="font-mono text-[11px] text-slate-400">{l.code}</span>·<Phone className="h-3 w-3" />
                            {displayPhone(l.phone)}
                            {l.city && <>· {l.city}</>}
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <TemperatureBadge value={l.temperature} score={l.score} />
                      </td>
                      <td className="px-3 py-3">
                        <StageBadge value={l.stage} />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{l.monthlyBill ? formatINR(l.monthlyBill) : <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{l.recommendedKw ? <span className="font-medium">{l.recommendedKw} kW</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-3">
                        <Badge tone="slate">{humanize(l.source)}</Badge>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {l.nextFollowUpAt ? (
                          <span className={isPast(l.nextFollowUpAt) ? "font-medium text-rose-600" : "text-slate-600"}>{formatDistanceToNow(l.nextFollowUpAt, { addSuffix: true })}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {l.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={l.assignedTo.name} color={l.assignedTo.avatarColor} size={24} />
                            <span className="truncate text-xs text-slate-600">{l.assignedTo.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Unassigned</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                {page > 1 ? (
                  <ButtonLink href={link(page - 1)} size="sm">
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </ButtonLink>
                ) : null}
                <span className="px-2">
                  Page {page} / {pages}
                </span>
                {page < pages ? (
                  <ButtonLink href={link(page + 1)} size="sm">
                    Next <ChevronRight className="h-4 w-4" />
                  </ButtonLink>
                ) : null}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

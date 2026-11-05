import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Users, ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { leadListWhere } from "@/lib/services/leads";
import { Avatar, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { LeadFilters } from "@/components/leads/lead-filters";
import { LeadRowActions } from "@/components/leads/lead-row-actions";
import { displayPhone } from "@/lib/text";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePageSession();
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 25;
  const where = leadListWhere(q, session);
  // Disqualified leads live behind a toggle so the working list stays clean.
  const disq = sp.disq === "1";
  if (disq) where.stage = "DISQUALIFIED";
  else if (!sp.stage) where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { stage: { not: "DISQUALIFIED" } }];
  const disqParams = new URLSearchParams(q);
  disqParams.delete("page");
  disqParams.delete("stage");
  if (disq) disqParams.delete("disq");
  else disqParams.set("disq", "1");
  const disqLink = `/leads${disqParams.toString() ? `?${disqParams}` : ""}`;
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
        subtitle={`${total.toLocaleString("en-IN")} ${total === 1 ? "lead" : "leads"}${disq ? " disqualified" : ""} · Prospective customers, tracked from first enquiry until they convert into a project or get disqualified`}
        actions={
          <>
            <Link href={disqLink} className="inline-flex items-center gap-2 text-sm text-slate-600" title="Show disqualified leads">
              <span className={`relative h-5 w-9 rounded-full transition ${disq ? "bg-teal-600" : "bg-slate-300"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${disq ? "left-[18px]" : "left-0.5"}`} />
              </span>
              Disqualified leads
            </Link>
            {can(session.role, "leads:edit") && (
              <ButtonLink href="/leads/new" variant="primary">
                + New Lead
              </ButtonLink>
            )}
          </>
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
                    <th className="w-10 px-4 py-2.5"><input type="checkbox" aria-label="Select all" className="rounded border-slate-300" /></th>
                    <th className="px-3 py-2.5">Unique ID</th>
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5">Ph No</th>
                    <th className="px-3 py-2.5">Assigned To</th>
                    <th className="px-3 py-2.5 text-right">Monthly Bill</th>
                    <th className="px-3 py-2.5">Location</th>
                    <th className="px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${l.name}`} className="rounded border-slate-300" /></td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-500">{l.code}</td>
                      <td className="px-3 py-3">
                        <Link href={`/leads/${l.id}`} className="font-medium text-teal-700 underline-offset-2 hover:underline">{l.name}</Link>
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400" />{displayPhone(l.phone)}</span>
                      </td>
                      <td className="px-3 py-3">
                        {l.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={l.assignedTo.name} color={l.assignedTo.avatarColor} size={24} />
                            <span className="max-w-[140px] truncate text-xs text-slate-600">{l.assignedTo.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{l.monthlyBill ? l.monthlyBill.toLocaleString("en-IN") : <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-3 text-slate-600">{l.city ?? l.district ?? <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-2">
                        <LeadRowActions id={l.id} name={l.name} phone={l.phone} email={l.email} canDelete={can(session.role, "leads:delete")} canQuote={can(session.role, "quotations:create")} />
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

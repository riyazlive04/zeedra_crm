import Link from "next/link";
import { Search } from "lucide-react";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PROJECT_STAGES } from "@/lib/defaults";
import { humanize } from "@/lib/text";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "PM Dashboard" };

const SEGMENT_STYLE: Record<string, string> = {
  RESIDENTIAL: "bg-orange-500",
  COMMERCIAL: "bg-sky-600",
  INDUSTRIAL: "bg-violet-600",
  AGRICULTURE: "bg-green-600",
  HOUSING_SOCIETY: "bg-amber-600",
  INSTITUTIONAL: "bg-indigo-600",
};

/** One row per installation: stage progress, task health, size and type — a project manager's at-a-glance view. */
export default async function PmDashboardPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const session = await requirePageSession("projects:manage");
  const { q = "", sort = "" } = await searchParams;
  const search = q.trim();
  const projects = await db.project.findMany({
    where: {
      organizationId: session.orgId,
      ...(session.role === "INSTALLER" ? { managerId: session.userId } : {}),
      ...(search ? { OR: [{ code: { contains: search.toUpperCase() } }, { lead: { name: { contains: search } } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
    include: { lead: { select: { id: true, name: true, segment: true, stage: true } } },
  });
  const tasks = projects.length
    ? await db.task.findMany({ where: { organizationId: session.orgId, leadId: { in: projects.map((p) => p.leadId) } }, select: { leadId: true, done: true, dueAt: true } })
    : [];
  const now = new Date();
  const rows = projects.map((p) => {
    const i = PROJECT_STAGES.findIndex((s) => s.key === p.stage);
    const pct = Math.round(((i + 1) / PROJECT_STAGES.length) * 100);
    const t = tasks.filter((x) => x.leadId === p.leadId);
    return {
      p,
      pct,
      stageLabel: PROJECT_STAGES[i]?.label ?? p.stage,
      total: t.length,
      completed: t.filter((x) => x.done).length,
      delayed: t.filter((x) => !x.done && x.dueAt < now).length,
      inProgress: t.filter((x) => !x.done && x.dueAt >= now).length,
    };
  });
  if (sort === "pct") rows.sort((a, b) => b.pct - a.pct);
  if (sort === "-pct") rows.sort((a, b) => a.pct - b.pct);
  const nextSort = sort === "pct" ? "-pct" : "pct";

  return (
    <div>
      <PageHeader
        title="PM Dashboard"
        subtitle="Every installation's progress, task health and size at a glance."
        actions={
          <form className="flex items-center gap-2">
            <input name="q" defaultValue={search} placeholder="Customer or project ID" className="h-9 w-56 rounded-lg border border-slate-200 px-3 text-sm" />
            <button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">
              <Search className="h-4 w-4" /> Search
            </button>
          </form>
        }
      />
      <Card className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <div className="p-8"><EmptyState title="No projects yet" body="Projects appear here when a lead is marked Won." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700">
                <tr className="border-b border-slate-200">
                  <th rowSpan={2} className="border-r border-slate-200 px-4 py-2 text-left">Customer Name</th>
                  <th rowSpan={2} className="border-r border-slate-200 px-3 py-2">Project ID</th>
                  <th rowSpan={2} className="border-r border-slate-200 px-3 py-2">
                    <Link href={`/pm-dashboard?${new URLSearchParams({ ...(search ? { q: search } : {}), sort: nextSort })}`} className="hover:text-teal-700">% Completion {sort === "pct" ? "↓" : sort === "-pct" ? "↑" : "↕"}</Link>
                  </th>
                  <th rowSpan={2} className="border-r border-slate-200 px-3 py-2">% To Be Completed</th>
                  <th rowSpan={2} className="border-r border-slate-200 px-3 py-2">Status Lane</th>
                  <th colSpan={3} className="border-r border-slate-200 px-3 py-2">Tasks</th>
                  <th rowSpan={2} className="border-r border-slate-200 px-3 py-2">Size</th>
                  <th rowSpan={2} className="px-3 py-2">Project Type</th>
                </tr>
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2"><span className="rounded-full bg-green-500 px-2.5 py-0.5 text-[11px] text-white">Completed</span></th>
                  <th className="px-3 py-2"><span className="rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] text-white">Delayed</span></th>
                  <th className="border-r border-slate-200 px-3 py-2"><span className="whitespace-nowrap rounded-full bg-blue-500 px-2.5 py-0.5 text-[11px] text-white">In Progress</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-center">
                {rows.map(({ p, pct, stageLabel, total, completed, delayed, inProgress }) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-left"><Link href={`/projects?open=${p.id}`} className="font-medium text-teal-700 hover:underline">{p.lead.name}</Link></td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-600">{p.code}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} /></div>
                        <span className="w-9 text-right text-xs tabular-nums">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-amber-500" style={{ width: `${100 - pct}%` }} /></div>
                        {pct === 100 ? <span className="grid h-4 w-4 place-items-center rounded-full bg-green-500 text-[10px] text-white">✓</span> : <span className="w-9 text-right text-xs tabular-nums">{100 - pct}%</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{p.lead.stage === "LOST" ? "Lost" : stageLabel}</td>
                    <td className="px-3 py-3 tabular-nums">{completed}/{total}</td>
                    <td className={`px-3 py-3 tabular-nums ${delayed ? "font-semibold text-red-600" : ""}`}>{delayed}/{total}</td>
                    <td className="px-3 py-3 tabular-nums">{inProgress}/{total}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{p.systemKw} KW</td>
                    <td className="px-3 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium text-white ${SEGMENT_STYLE[p.lead.segment] ?? "bg-slate-500"}`}>
                        {humanize(p.lead.segment)}
                      </span>
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

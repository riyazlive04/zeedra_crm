import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { Users, Flame, CalendarDays, IndianRupee, Trophy, Percent, AlarmClock, ShieldAlert, ArrowRight, Zap, CheckSquare } from "lucide-react";
import { requirePageSession } from "@/lib/auth";
import { dashboardStats } from "@/lib/services/dashboard";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { Avatar, Card, CardHeader, EmptyState, PageHeader, StatCard, ButtonLink } from "@/components/ui";
import { TemperatureBadge, STAGE_LABEL } from "@/components/badges";
import { LeadTrendChart, HBarChart } from "@/components/charts";
import { AiBrief } from "@/components/ai-brief";
import { formatINRCompact, humanize } from "@/lib/text";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const session = await requirePageSession();
  const sp = await searchParams;
  const [s, tasks] = await Promise.all([
    dashboardStats(session),
    db.task.findMany({
      where: { organizationId: session.orgId, assignedToId: session.userId, done: false },
      orderBy: { dueAt: "asc" },
      take: 6,
      include: { lead: { select: { id: true, name: true } } },
    }),
  ]);
  const manager = can(session.role, "reports:view");
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      {sp.welcome && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          🎉 Your workspace is ready with WhatsApp templates, 13 automations and PM Surya Ghar pricing. Next: <Link href="/settings?tab=team" className="font-semibold underline">invite your team</Link>, then{" "}
          <Link href="/settings?tab=integrations" className="font-semibold underline">connect WhatsApp & Google Calendar</Link>.
        </div>
      )}
      <PageHeader
        eyebrow={format(new Date(), "EEEE, d MMMM yyyy")}
        title={`${greet}, ${session.name.split(" ")[0]}`}
        subtitle={manager ? "Here is how your solar sales engine is performing." : "Here is your day."}
        actions={
          <>
            <ButtonLink href="/leads?temperature=HOT&open=1" variant="secondary" size="sm">
              <Flame className="h-4 w-4 text-rose-500" /> Hot leads
            </ButtonLink>
            <ButtonLink href="/leads/new" variant="primary" size="sm">
              + New lead
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="New leads today" value={s.kpis.leadsToday} hint={`${s.kpis.leadsMonth} this month`} icon={<Users className="h-4 w-4" />} href="/leads" />
        <StatCard label="Hot leads open" value={s.kpis.hotOpen} hint="Ready to close" icon={<Flame className="h-4 w-4" />} tone="red" href="/leads?temperature=HOT&open=1" />
        <StatCard label="Visits today" value={s.kpis.visitsToday} hint="Site & meetings" icon={<CalendarDays className="h-4 w-4" />} tone="blue" href="/appointments" />
        <StatCard label="Pipeline value" value={formatINRCompact(s.kpis.pipelineValue)} hint="Qualified → negotiation" icon={<IndianRupee className="h-4 w-4" />} tone="violet" href="/pipeline" />
        <StatCard label="Won this month" value={s.kpis.wonMonth} hint={`${formatINRCompact(s.kpis.wonValueMonth)} · ${s.kpis.wonKwMonth.toFixed(1)} kW`} icon={<Trophy className="h-4 w-4" />} tone="green" />
        <StatCard label="Win rate (30d)" value={`${s.kpis.conversionRate}%`} hint="Won ÷ closed" icon={<Percent className="h-4 w-4" />} tone="slate" />
        <StatCard label="Overdue follow-ups" value={s.kpis.overdueFollowUps} hint="Call these first" icon={<AlarmClock className="h-4 w-4" />} tone={s.kpis.overdueFollowUps ? "red" : "green"} href="/leads?followUpDue=1&sort=followup" />
        <StatCard label="Flagged quotes (7d)" value={s.kpis.flaggedQuotes} hint="GPS / time checks" icon={<ShieldAlert className="h-4 w-4" />} tone={s.kpis.flaggedQuotes ? "amber" : "green"} href={manager ? "/tracking" : "/quotations"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {manager && <AiBrief />}
          <Card>
            <CardHeader title="New leads per day" subtitle="Last 14 days" />
            <div className="px-3 pb-3 pt-2">
              <LeadTrendChart data={s.trend} />
            </div>
          </Card>
          <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader title="Sales funnel" subtitle="Leads that reached each stage" />
              <div className="px-4 py-3">
                <HBarChart unit="leads" height={260} data={s.funnel.map((f) => ({ label: STAGE_LABEL[f.stage], value: f.count }))} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Lead sources" subtitle="Last 30 days" />
              <div className="px-4 py-3">
                {s.sources.length ? (
                  <HBarChart unit="leads" height={260} data={s.sources.slice(0, 8).map((x) => ({ label: humanize(x.source), value: x.count }))} />
                ) : (
                  <EmptyState title="No leads in the last 30 days" />
                )}
              </div>
            </Card>
          </div>
          {manager && (
            <Card>
              <CardHeader title="Team leaderboard" subtitle="Last 30 days · GPS-verified share of field quotations" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-5 py-2">Salesperson</th>
                      <th className="px-3 py-2 text-right">Quotes</th>
                      <th className="px-3 py-2 text-right">GPS verified</th>
                      <th className="px-3 py-2 text-right">Won</th>
                      <th className="px-5 py-2 text-right">Won value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.team.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={t.name} color={t.avatarColor} size={26} />
                            <div>
                              <div className="font-medium text-slate-800">{t.name}</div>
                              <div className="text-[11px] text-slate-400">{humanize(t.role)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{t.quotes}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {t.verifiedPct == null ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span className={t.verifiedPct >= 90 ? "text-emerald-700" : t.verifiedPct >= 70 ? "text-amber-700" : "text-rose-700"}>
                              {t.verifiedPct}% {t.verifiedPct < 70 && "⚠"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{t.won}</td>
                        <td className="px-5 py-2.5 text-right font-medium tabular-nums">{formatINRCompact(t.wonValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Lead temperature" subtitle="Open leads" />
            <div className="grid grid-cols-3 divide-x divide-slate-100">
              {s.temperature.map((t) => (
                <Link key={t.temperature} href={`/leads?temperature=${t.temperature}&open=1`} className="px-3 py-4 text-center hover:bg-slate-50">
                  <div className="font-display text-2xl font-bold text-slate-900">{t.count}</div>
                  <div className="mt-1">
                    <TemperatureBadge value={t.temperature} />
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Upcoming appointments" action={<Link href="/appointments" className="text-xs font-medium text-sun-700 hover:underline">View all</Link>} />
            {s.upcoming.length === 0 ? (
              <EmptyState icon={<CalendarDays className="h-5 w-5" />} title="No upcoming visits" body="Book site visits from a lead's page." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {s.upcoming.map((a) => (
                  <li key={a.id}>
                    <Link href={`/leads/${a.lead.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                      <div className="w-14 shrink-0 rounded-lg bg-slate-50 py-1 text-center">
                        <div className="text-[10px] font-semibold uppercase text-sun-700">{format(a.startAt, "EEE")}</div>
                        <div className="text-sm font-bold text-slate-800">{format(a.startAt, "h:mm")}</div>
                        <div className="text-[10px] text-slate-400">{format(a.startAt, "a")}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">{a.lead.name}</div>
                        <div className="truncate text-xs text-slate-500">
                          {humanize(a.type)} · {a.lead.city ?? "—"}
                        </div>
                      </div>
                      <Avatar name={a.assignedTo.name} color={a.assignedTo.avatarColor} size={24} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Hot leads going cold" subtitle="No contact in 2+ days" icon={<Zap className="h-4 w-4" />} />
            {s.staleHot.length === 0 ? (
              <EmptyState title="Great — every hot lead is warm ☀️" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {s.staleHot.map((l) => (
                  <li key={l.id}>
                    <Link href={`/leads/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-slate-50">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800">{l.name}</div>
                        <div className="text-xs text-slate-500">{l.assignedTo?.name ?? "Unassigned"}</div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-rose-600">{l.days}d silent</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="My tasks" icon={<CheckSquare className="h-4 w-4" />} action={<Link href="/tasks" className="text-xs font-medium text-sun-700 hover:underline">All tasks</Link>} />
            {tasks.length === 0 ? (
              <EmptyState title="No open tasks" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {tasks.map((t) => (
                  <li key={t.id} className="px-5 py-2.5">
                    <Link href={t.lead ? `/leads/${t.lead.id}` : "/tasks"} className="block hover:text-sun-700">
                      <div className="truncate text-sm text-slate-800">{t.title}</div>
                      <div className={`text-xs ${t.dueAt < new Date() ? "font-medium text-rose-600" : "text-slate-500"}`}>
                        {t.dueAt < new Date() ? "Overdue · " : "Due "}
                        {formatDistanceToNow(t.dueAt, { addSuffix: true })}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-slate-100 px-5 py-2.5">
              <Link href="/tasks" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-sun-700">
                Open task board <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

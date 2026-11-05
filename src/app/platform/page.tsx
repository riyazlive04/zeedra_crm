import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Building2, Users, UserPlus, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePlatformPage } from "@/lib/platform";
import { PageHeader, StatCard, Card } from "@/components/ui";
import { PLANS, isPlanId } from "@/lib/billing/plans";
import { NewClientButton } from "@/components/platform/platform-actions";

export const dynamic = "force-dynamic";

function statusOf(o: { suspendedAt: Date | null; billingStatus: string; trialEndsAt: Date | null }) {
  if (o.suspendedAt) return { label: "Suspended", cls: "bg-rose-100 text-rose-700" };
  if (o.billingStatus === "ACTIVE") return { label: "Paying", cls: "bg-green-100 text-green-700" };
  if (o.billingStatus === "CANCELED") return { label: "Canceled", cls: "bg-slate-200 text-slate-600" };
  if (o.trialEndsAt && o.trialEndsAt < new Date()) return { label: "Trial ended", cls: "bg-amber-100 text-amber-800" };
  const days = o.trialEndsAt ? Math.ceil((o.trialEndsAt.getTime() - Date.now()) / 86_400_000) : null;
  return { label: days != null ? `Trial · ${days}d left` : "Trial", cls: "bg-sky-100 text-sky-700" };
}

export default async function PlatformHome({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requirePlatformPage();
  const { q = "", status = "" } = await searchParams;
  const search = q.trim();
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const [orgs, userCounts, leadCounts, leads30, lastLogins] = await Promise.all([
    db.organization.findMany({
      where: search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }, { slug: { contains: search.toLowerCase() } }] } : {},
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, slug: true, email: true, phone: true, plan: true, billingStatus: true, trialEndsAt: true, suspendedAt: true, createdAt: true },
    }),
    db.user.groupBy({ by: ["organizationId"], where: { active: true }, _count: { _all: true } }),
    db.lead.groupBy({ by: ["organizationId"], _count: { _all: true } }),
    db.lead.groupBy({ by: ["organizationId"], where: { createdAt: { gte: since30 } }, _count: { _all: true } }),
    db.user.groupBy({ by: ["organizationId"], _max: { lastLoginAt: true } }),
  ]);
  const count = (list: { organizationId: string; _count: { _all: number } }[], id: string) => list.find((x) => x.organizationId === id)?._count._all ?? 0;
  const rows = orgs
    .map((o) => ({ ...o, users: count(userCounts, o.id), leads: count(leadCounts, o.id), leads30: count(leads30, o.id), lastLogin: lastLogins.find((x) => x.organizationId === o.id)?._max.lastLoginAt ?? null, st: statusOf(o) }))
    .filter((o) => !status || (status === "trial" ? o.st.label.startsWith("Trial") : status === "paying" ? o.st.label === "Paying" : status === "suspended" ? o.st.label === "Suspended" : true));
  const all = orgs.map(statusOf);

  return (
    <div>
      <PageHeader title="Clients" subtitle="Every company using Zeedra. Create clients, manage plans and trials, and help them with View as." actions={<NewClientButton />} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Companies" value={orgs.length} icon={<Building2 className="h-4 w-4" />} />
        <StatCard label="Paying" value={all.filter((s) => s.label === "Paying").length} icon={<Users className="h-4 w-4" />} tone="green" />
        <StatCard label="On trial" value={all.filter((s) => s.label.startsWith("Trial")).length} icon={<UserPlus className="h-4 w-4" />} tone="blue" />
        <StatCard label="Need attention" value={all.filter((s) => s.label === "Trial ended" || s.label === "Suspended").length} icon={<AlertTriangle className="h-4 w-4" />} tone="red" hint="Trial ended or suspended" />
      </div>
      <Card className="overflow-hidden p-0">
        <form className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <input name="q" defaultValue={search} placeholder="Search company, email or slug" className="input h-9 w-72" />
          <select name="status" defaultValue={status} className="input h-9 w-auto py-0 text-sm">
            <option value="">All companies</option>
            <option value="trial">On trial</option>
            <option value="paying">Paying</option>
            <option value="suspended">Suspended</option>
          </select>
          <button className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Filter</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Company</th><th className="px-3 py-3">Plan</th><th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Users</th><th className="px-3 py-3 text-right">Leads</th><th className="px-3 py-3 text-right">Leads (30d)</th>
                <th className="px-3 py-3">Last sign-in</th><th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/platform/${o.id}`} className="font-medium text-teal-700 hover:underline">{o.name}</Link>
                    <div className="text-xs text-slate-400">{o.email ?? o.slug}</div>
                  </td>
                  <td className="px-3 py-3">{isPlanId(o.plan) ? PLANS[o.plan].name : o.plan}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.st.cls}`}>{o.st.label}</span></td>
                  <td className="px-3 py-3 text-right tabular-nums">{o.users}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{o.leads.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{o.leads30}</td>
                  <td className="px-3 py-3 text-xs text-slate-500">{o.lastLogin ? formatDistanceToNow(o.lastLogin, { addSuffix: true }) : "Never"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{o.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">No companies match.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

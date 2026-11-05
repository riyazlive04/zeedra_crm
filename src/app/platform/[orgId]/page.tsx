import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePlatformPage } from "@/lib/platform";
import { Card, CardHeader } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/rbac";
import { PLANS, isPlanId } from "@/lib/billing/plans";
import { ClientActions } from "@/components/platform/platform-actions";

export const dynamic = "force-dynamic";

export default async function PlatformClient({ params }: { params: Promise<{ orgId: string }> }) {
  const admin = await requirePlatformPage();
  const { orgId } = await params;
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, slug: true, email: true, phone: true, address: true, gstin: true, plan: true, billingStatus: true, trialEndsAt: true, subscribedAt: true, suspendedAt: true, suspendedReason: true, createdAt: true, waPhoneNumberId: true },
  });
  if (!org) notFound();
  const [users, leads, leads30, quotes, projects, log] = await Promise.all([
    db.user.findMany({ where: { organizationId: orgId }, orderBy: [{ active: "desc" }, { role: "asc" }], select: { id: true, name: true, email: true, phone: true, role: true, active: true, lastLoginAt: true } }),
    db.lead.count({ where: { organizationId: orgId } }),
    db.lead.count({ where: { organizationId: orgId, createdAt: { gte: since30 } } }),
    db.quotation.count({ where: { organizationId: orgId } }),
    db.project.count({ where: { organizationId: orgId } }),
    db.auditLog.findMany({ where: { organizationId: orgId, action: { startsWith: "platform." } }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const owner = users.find((u) => u.role === "OWNER");
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-");

  return (
    <div className="space-y-5">
      <Link href="/platform" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ArrowLeft className="h-4 w-4" /> All clients</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{org.name}</h1>
          <p className="text-sm text-slate-500">{[org.email, org.phone, org.address].filter(Boolean).join(" · ") || org.slug} · joined {fmt(org.createdAt)}</p>
        </div>
      </div>
      {org.suspendedAt && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Suspended {formatDistanceToNow(org.suspendedAt, { addSuffix: true })}{org.suspendedReason ? `: ${org.suspendedReason}` : ""}. Nobody in this company can sign in.
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Leads", leads.toLocaleString("en-IN")], ["Leads (30 days)", leads30], ["Quotations", quotes], ["Installations", projects]].map(([l, v]) => (
              <Card key={l} className="p-4"><div className="text-xs text-slate-500">{l}</div><div className="mt-1 text-2xl font-bold text-slate-800">{v}</div></Card>
            ))}
          </div>
          <Card className="overflow-hidden p-0">
            <CardHeader title="Team" subtitle={`${users.filter((u) => u.active).length} active of ${users.length}`} />
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500"><tr><th className="px-4 py-2">Name</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Last sign-in</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                    <td className="px-4 py-2.5"><div className="font-medium">{u.name}</div><div className="text-xs text-slate-500">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div></td>
                    <td className="px-3 py-2.5 text-xs">{ROLE_LABEL[u.role]}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{u.lastLoginAt ? formatDistanceToNow(u.lastLoginAt, { addSuffix: true }) : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <CardHeader title="Platform activity" subtitle="Changes made from this console" />
            <ul className="divide-y divide-slate-100 px-5 pb-4 text-sm">
              {log.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-2">
                  <span>{a.action.replace("platform.", "").replace(/_/g, " ")} <span className="text-xs text-slate-400">by {(a.meta as { by?: string } | null)?.by ?? "-"}</span></span>
                  <span className="text-xs text-slate-400">{formatDistanceToNow(a.createdAt, { addSuffix: true })}</span>
                </li>
              ))}
              {log.length === 0 && <li className="py-3 text-slate-500">Nothing yet.</li>}
            </ul>
          </Card>
        </div>
        <ClientActions
          org={{
            id: org.id, name: org.name, plan: org.plan, billingStatus: org.billingStatus, trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
            suspended: !!org.suspendedAt, isOwnCompany: org.id === admin.orgId, ownerEmail: owner?.email ?? null, whatsappConnected: !!org.waPhoneNumberId,
          }}
          plans={Object.values(PLANS).map((p) => ({ id: p.id, name: p.name, seatLimit: p.seatLimit }))}
          planName={isPlanId(org.plan) ? PLANS[org.plan].name : org.plan}
          subscribedAt={fmt(org.subscribedAt)}
        />
      </div>
    </div>
  );
}

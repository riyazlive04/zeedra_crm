import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Sun } from "lucide-react";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { NewDesignForm } from "@/components/design/new-design-form";

export const metadata = { title: "Roof Design & Shading" };

export default async function DesignsPage({ searchParams }: { searchParams: Promise<{ leadId?: string }> }) {
  const session = await requirePageSession();
  const { leadId } = await searchParams;
  const [designs, lead] = await Promise.all([
    db.solarDesign.findMany({
      where: { organizationId: session.orgId },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, name: true, panelCount: true, systemKw: true, shadingLossPct: true, updatedAt: true, lead: { select: { id: true, name: true, code: true } } },
    }),
    leadId ? db.lead.findFirst({ where: { id: leadId, organizationId: session.orgId }, select: { id: true, name: true, code: true, lat: true, lng: true, address: true, city: true } }) : null,
  ]);
  const canEdit = can(session.role, "leads:edit");
  return (
    <div>
      <PageHeader title="Roof Design & Shading" subtitle="Draw the roof on satellite imagery, place modules, add obstructions and get an accurate year-round shading report — in 2D and 3D." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden p-0">
          {designs.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={<Sun className="h-6 w-6" />} title="No designs yet" body="Create your first rooftop design from the panel on the right." />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Design</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Size</th>
                  <th className="px-4 py-3 text-right">Modules</th>
                  <th className="px-4 py-3 text-right">Shading loss</th>
                  <th className="px-4 py-3 text-right">Updated</th>
                </tr>
              </thead>
              <tbody>
                {designs.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3"><Link href={`/designs/${d.id}`} className="font-medium text-teal-700 hover:underline">{d.name}</Link></td>
                    <td className="px-4 py-3 text-slate-600">{d.lead ? <Link href={`/leads/${d.lead.id}`} className="hover:underline">{d.lead.code} · {d.lead.name}</Link> : "—"}</td>
                    <td className="px-4 py-3 text-right">{d.systemKw.toFixed(2)} kW</td>
                    <td className="px-4 py-3 text-right">{d.panelCount}</td>
                    <td className="px-4 py-3 text-right">{d.shadingLossPct == null ? "—" : `${d.shadingLossPct.toFixed(1)}%`}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatDistanceToNow(d.updatedAt, { addSuffix: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        {canEdit && (
          <NewDesignForm
            lead={lead ? { id: lead.id, name: lead.name, code: lead.code, lat: lead.lat, lng: lead.lng, address: [lead.address, lead.city].filter(Boolean).join(", ") } : null}
          />
        )}
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { parseDesign } from "@/lib/solar/shading";
import { DesignEditor } from "@/components/design/editor";

export const metadata = { title: "Roof design" };

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession();
  const { id } = await params;
  const d = await db.solarDesign.findFirst({
    where: { id, organizationId: session.orgId },
    include: { lead: { select: { id: true, name: true, code: true, address: true } } },
  });
  if (!d) notFound();
  return (
    <DesignEditor
      canEdit={can(session.role, "leads:edit")}
      init={{ id: d.id, name: d.name, data: parseDesign(d.data, { lat: d.lat, lng: d.lng }), lead: d.lead, shareToken: d.shareToken }}
    />
  );
}

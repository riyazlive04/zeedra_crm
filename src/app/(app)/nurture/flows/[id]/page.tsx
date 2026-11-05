import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { parseGraph, parseSettings } from "@/lib/nurture/engine";
import { FlowEditor } from "@/components/nurture/flow-editor";

export const metadata = { title: "WhatsApp flow" };

export default async function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession();
  const { id } = await params;
  const f = await db.flow.findFirst({ where: { id, organizationId: session.orgId } });
  if (!f) notFound();
  return (
    <FlowEditor
      canEdit={can(session, "automations:manage")}
      init={{ id: f.id, name: f.name, active: f.active, graph: parseGraph(f.graph), settings: parseSettings(f.settings) }}
    />
  );
}

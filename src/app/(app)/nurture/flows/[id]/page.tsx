import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { parseGraph, parseSettings } from "@/lib/nurture/engine";
import { triggerNode } from "@/lib/nurture/types";
import { FlowEditor } from "@/components/nurture/flow-editor";

export const metadata = { title: "WhatsApp flow" };

export default async function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession();
  const { id } = await params;
  const f = await db.flow.findFirst({ where: { id, organizationId: session.orgId } });
  if (!f) notFound();
  const [org, rules, live] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { waPhoneNumberId: true, waAccessToken: true } }),
    db.automationRule.findMany({ where: { organizationId: session.orgId, active: true }, select: { id: true, name: true, trigger: true, actions: true } }),
    db.flow.findMany({ where: { organizationId: session.orgId, active: true, id: { not: f.id } }, select: { id: true, name: true, graph: true } }),
  ]);
  // Rules that also message leads on WhatsApp, so the editor can warn about double messages.
  const waRules = rules
    .filter((r) => Array.isArray(r.actions) && (r.actions as { type?: string }[]).some((a) => a.type === "SEND_WHATSAPP"))
    .map((r) => ({ id: r.id, name: r.name, trigger: r.trigger }));
  const otherFlows = live.map((x) => {
    const t = triggerNode(parseGraph(x.graph));
    return { id: x.id, name: x.name, trigger: t?.data.trigger ?? "", keywords: t?.data.keywords ?? [] };
  });
  return (
    <FlowEditor
      canEdit={can(session, "automations:manage")}
      connected={!!(org.waPhoneNumberId && org.waAccessToken)}
      rules={waRules}
      otherFlows={otherFlows}
      init={{ id: f.id, name: f.name, active: f.active, graph: parseGraph(f.graph), settings: parseSettings(f.settings) }}
    />
  );
}

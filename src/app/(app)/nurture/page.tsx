import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { NurtureHome } from "@/components/nurture/nurture-home";

export const metadata = { title: "WhatsApp Nurture" };

export default async function NurturePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requirePageSession();
  const { tab } = await searchParams;
  const since = new Date(Date.now() - 30 * 86400000);
  const [org, flows, runCounts, templates, msgStats, inbound, optedOut] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { waPhoneNumberId: true, waAccessToken: true } }),
    db.flow.findMany({ where: { organizationId: session.orgId }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, description: true, active: true, updatedAt: true, graph: true } }),
    db.flowRun.groupBy({ by: ["flowId", "status"], where: { organizationId: session.orgId }, _count: true }),
    db.messageTemplate.findMany({ where: { organizationId: session.orgId, active: true }, select: { key: true, name: true, body: true, metaTemplateName: true }, orderBy: { name: "asc" } }),
    db.whatsAppMessage.groupBy({ by: ["status", "automated"], where: { organizationId: session.orgId, direction: "OUT", createdAt: { gte: since } }, _count: true }),
    db.whatsAppMessage.count({ where: { organizationId: session.orgId, direction: "IN", createdAt: { gte: since } } }),
    db.lead.count({ where: { organizationId: session.orgId, whatsappOptIn: false } }),
  ]);
  const flowRows = flows.map((f) => {
    const c = (s: string) => runCounts.find((x) => x.flowId === f.id && x.status === s)?._count ?? 0;
    const g = f.graph as { nodes?: { data?: { kind?: string; trigger?: string; keywords?: string[] } }[] } | null;
    const t = g?.nodes?.find((n) => n.data?.kind === "trigger")?.data;
    return {
      id: f.id, name: f.name, description: f.description, active: f.active, updatedAt: f.updatedAt.toISOString(),
      steps: g?.nodes?.length ?? 0, trigger: t?.trigger ?? "", keywords: t?.keywords ?? [],
      inFlow: c("ACTIVE") + c("WAITING_REPLY"), completed: c("COMPLETED"), stopped: c("STOPPED"),
    };
  });
  const sum = (pred: (s: string) => boolean) => msgStats.filter((m) => pred(m.status)).reduce((a, m) => a + m._count, 0);
  const analytics = {
    sent: sum((s) => s !== "FAILED" && s !== "QUEUED"),
    delivered: sum((s) => s === "DELIVERED" || s === "READ"),
    read: sum((s) => s === "READ"),
    failed: sum((s) => s === "FAILED"),
    automated: msgStats.filter((m) => m.automated && m.status !== "FAILED").reduce((a, m) => a + m._count, 0),
    inbound,
    optedOut,
  };
  return (
    <div>
      <PageHeader title="WhatsApp Nurture" subtitle="Mind-map journeys that talk to leads on WhatsApp, branch on their replies and hand hot leads to your team. Broadcasts and analytics live here too." />
      <NurtureHome
        initialTab={tab === "broadcasts" || tab === "analytics" ? tab : "flows"}
        connected={!!(org.waPhoneNumberId && org.waAccessToken)}
        canEdit={can(session, "automations:manage")}
        flows={flowRows}
        templates={templates}
        analytics={analytics}
      />
    </div>
  );
}

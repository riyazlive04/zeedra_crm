import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, StatCard } from "@/components/ui";
import { AutomationsBoard, type Rule } from "@/components/automations-board";
import { Zap, MessageCircle, Activity } from "lucide-react";

export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const session = await requirePageSession("automations:manage");
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [rules, templates, autoMsgs] = await Promise.all([
    db.automationRule.findMany({ where: { organizationId: session.orgId }, orderBy: { createdAt: "asc" } }),
    db.messageTemplate.findMany({ where: { organizationId: session.orgId }, select: { key: true, name: true }, orderBy: { name: "asc" } }),
    db.whatsAppMessage.count({ where: { organizationId: session.orgId, automated: true, createdAt: { gte: since } } }),
  ]);
  const errors = await db.automationRun.findMany({
    where: { ruleId: { in: rules.map((r) => r.id) }, status: "ERROR" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <PageHeader title="Automations" subtitle="Your sales playbook on autopilot — WhatsApp replies, reminders, follow-ups and alerts." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Active automations" value={`${rules.filter((r) => r.active).length}/${rules.length}`} icon={<Zap className="h-4 w-4" />} />
        <StatCard label="Automated WhatsApp (7d)" value={autoMsgs} icon={<MessageCircle className="h-4 w-4" />} tone="green" />
        <StatCard label="Total runs" value={rules.reduce((a, r) => a + r.runCount, 0).toLocaleString("en-IN")} icon={<Activity className="h-4 w-4" />} tone="violet" />
      </div>
      <AutomationsBoard
        templates={templates}
        errors={errors.map((e) => ({ ruleId: e.ruleId, detail: e.detail, createdAt: e.createdAt.toISOString() }))}
        rules={rules.map(
          (r) =>
            ({
              ...r,
              conditions: r.conditions,
              actions: r.actions,
              lastRunAt: r.lastRunAt?.toISOString() ?? null,
            }) as unknown as Rule,
        )}
      />
    </div>
  );
}

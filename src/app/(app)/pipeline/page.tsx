import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { leadScope } from "@/lib/services/leads";
import { PageHeader } from "@/components/ui";
import { Kanban } from "@/components/leads/kanban";
import { formatINRCompact } from "@/lib/text";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const session = await requirePageSession();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const leads = await db.lead.findMany({
    where: {
      ...leadScope(session),
      OR: [{ stage: { notIn: ["WON", "LOST", "DISQUALIFIED"] } }, { stage: { in: ["WON", "LOST"] }, updatedAt: { gte: since } }],
    },
    orderBy: [{ score: "desc" }],
    take: 600,
    select: {
      id: true, name: true, code: true, stage: true, temperature: true, score: true, recommendedKw: true, estimatedCost: true, city: true,
      assignedTo: { select: { name: true, avatarColor: true } },
    },
  });
  const open = leads.filter((l) => !["WON", "LOST"].includes(l.stage));
  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle={`${open.length} open deals · ${formatINRCompact(open.reduce((a, b) => a + (b.estimatedCost ?? 0), 0))} · ${open.reduce((a, b) => a + (b.recommendedKw ?? 0), 0).toFixed(1)} kW. Won/lost show the last 30 days. Drag cards to move stages.`}
      />
      <Kanban leads={leads} canEdit={can(session.role, "leads:edit")} />
    </div>
  );
}

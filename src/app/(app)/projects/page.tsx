import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, StatCard } from "@/components/ui";
import { ProjectsBoard } from "@/components/projects-board";
import { Hammer, Zap, Landmark, IndianRupee } from "lucide-react";
import { formatINRCompact } from "@/lib/text";
import { parseSettings } from "@/lib/settings";

export const metadata = { title: "Installations" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const session = await requirePageSession("projects:manage");
  const { open } = await searchParams;
  const [projects, users, team, org] = await Promise.all([
    db.project.findMany({
      where: { organizationId: session.orgId, ...(session.role === "INSTALLER" ? { managerId: session.userId } : {}) },
      orderBy: { updatedAt: "desc" },
      include: { lead: { select: { id: true, name: true, phone: true, city: true } }, manager: { select: { id: true, name: true, avatarColor: true } } },
    }),
    db.user.findMany({ where: { organizationId: session.orgId, active: true, role: { in: ["OWNER", "ADMIN", "SALES_MANAGER", "INSTALLER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { organizationId: session.orgId, active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { settings: true } }),
  ]);
  const workflow = parseSettings(org.settings).projectWorkflow;
  const active = projects.filter((p) => p.stage !== "CLOSED");
  const pendingSubsidy = projects.filter((p) => ["COMMISSIONED", "SUBSIDY_APPLIED"].includes(p.stage)).length;
  const receivable = projects.reduce((a, p) => a + Math.max(0, p.contractValue - p.amountReceived), 0);

  return (
    <div>
      <PageHeader title="Installations" subtitle="From booking to subsidy credit — PM Surya Ghar portal, DISCOM approvals, net-metering and payments in one tracker." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active projects" value={active.length} icon={<Hammer className="h-4 w-4" />} />
        <StatCard label="Capacity in execution" value={`${active.reduce((a, p) => a + p.systemKw, 0).toFixed(1)} kW`} icon={<Zap className="h-4 w-4" />} tone="violet" />
        <StatCard label="Awaiting subsidy" value={pendingSubsidy} icon={<Landmark className="h-4 w-4" />} tone="blue" />
        <StatCard label="Receivables" value={formatINRCompact(receivable)} icon={<IndianRupee className="h-4 w-4" />} tone={receivable ? "red" : "green"} />
      </div>
      <ProjectsBoard
        initialOpen={open}
        users={users}
        team={team}
        workflow={workflow}
        projects={projects.map((p) => ({
          ...p,
          installDate: p.installDate?.toISOString() ?? null,
          updatedAt: p.updatedAt.toISOString(),
          checklist: (p.checklist as Record<string, boolean>) ?? {},
          stageHistory: (p.stageHistory as { stage: string; at: string; by: string }[]) ?? [],
        }))}
      />
    </div>
  );
}

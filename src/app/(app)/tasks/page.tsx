import Link from "next/link";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { TasksBoard } from "@/components/tasks-board";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const session = await requirePageSession();
  const { team } = await searchParams;
  const showTeam = team === "1" && can(session.role, "leads:assign");
  const tasks = await db.task.findMany({
    where: {
      organizationId: session.orgId,
      ...(showTeam ? {} : { assignedToId: session.userId }),
      OR: [{ done: false }, { doneAt: { gte: new Date(Date.now() - 3 * 86_400_000) } }],
    },
    orderBy: { dueAt: "asc" },
    take: 400,
    include: { lead: { select: { id: true, name: true, phone: true } }, assignedTo: { select: { name: true } } },
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={showTeam ? "Team tasks" : "My tasks"}
        subtitle="Follow-ups created by you and by automations."
        actions={
          can(session.role, "leads:assign") && (
            <Link href={showTeam ? "/tasks" : "/tasks?team=1"} className="text-sm font-medium text-sun-700 hover:underline">
              {showTeam ? "Show only mine" : "Show whole team"}
            </Link>
          )
        }
      />
      <TasksBoard key={String(showTeam)} showAssignee={showTeam} tasks={tasks.map((t) => ({ ...t, dueAt: t.dueAt.toISOString() }))} />
    </div>
  );
}

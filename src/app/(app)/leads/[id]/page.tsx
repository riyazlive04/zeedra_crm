import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { orgSettings } from "@/lib/api";
import { can } from "@/lib/rbac";
import { leadScope } from "@/lib/services/leads";
import { LeadWorkspace } from "@/components/leads/lead-workspace";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await db.lead.findUnique({ where: { id }, select: { name: true } });
  return { title: l?.name ?? "Lead" };
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession();
  const { id } = await params;
  // activities/messages key off the route id (not a field of `lead`), so every query can run
  // together instead of waiting on the lead fetch to resolve first.
  const [lead, settings, users, templates, activities, messages] = await Promise.all([
    db.lead.findFirst({
      where: { id, ...leadScope(session) },
      include: {
        assignedTo: { select: { id: true, name: true, avatarColor: true } },
        appointments: { orderBy: { startAt: "desc" }, include: { assignedTo: { select: { name: true } } } },
        quotations: { orderBy: { createdAt: "desc" } },
        project: { select: { id: true, code: true, stage: true } },
      },
    }),
    orgSettings(session.orgId),
    db.user.findMany({ where: { organizationId: session.orgId, active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    db.messageTemplate.findMany({ where: { organizationId: session.orgId, active: true }, select: { key: true, name: true }, orderBy: { name: "asc" } }),
    db.activity.findMany({ where: { leadId: id }, orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true } } } }),
    db.whatsAppMessage.findMany({ where: { leadId: id }, orderBy: { createdAt: "asc" }, take: 300 }),
  ]);
  if (!lead) notFound();

  return (
    <div>
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ChevronLeft className="h-3.5 w-3.5" /> All leads
      </Link>
      <LeadWorkspace
        lead={lead}
        settings={settings}
        users={users}
        templates={templates}
        activities={activities}
        messages={messages}
        me={session.userId}
        perms={{
          assign: can(session.role, "leads:assign"),
          reviewQuotes: can(session.role, "quotations:review"),
          createQuote: can(session.role, "quotations:create"),
          whatsapp: can(session.role, "whatsapp:send"),
          edit: can(session.role, "leads:edit"),
        }}
      />
    </div>
  );
}

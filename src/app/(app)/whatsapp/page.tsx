import Link from "next/link";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadScope } from "@/lib/services/leads";
import { PageHeader } from "@/components/ui";
import { Inbox } from "@/components/whatsapp/inbox";

export const metadata = { title: "WhatsApp" };

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const session = await requirePageSession("whatsapp:send");
  const { lead } = await searchParams;
  const [messages, templates, org] = await Promise.all([
    db.whatsAppMessage.findMany({
      where: { organizationId: session.orgId, leadId: { not: null }, lead: leadScope(session) },
      orderBy: { createdAt: "desc" },
      take: 1500,
      select: { leadId: true, body: true, direction: true, status: true, createdAt: true, lead: { select: { id: true, name: true, code: true, phone: true, temperature: true } } },
    }),
    db.messageTemplate.findMany({ where: { organizationId: session.orgId, active: true }, select: { key: true, name: true }, orderBy: { name: "asc" } }),
    db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { waPhoneNumberId: true, waAccessToken: true } }),
  ]);

  const convos = new Map<string, { leadId: string; body: string; direction: string; createdAt: string; unread: number; lead: (typeof messages)[number]["lead"] & object }>();
  for (const m of messages) {
    if (!m.leadId || !m.lead) continue;
    const c = convos.get(m.leadId);
    const unread = m.direction === "IN" && m.status === "RECEIVED" ? 1 : 0;
    if (!c) convos.set(m.leadId, { leadId: m.leadId, body: m.body, direction: m.direction, createdAt: m.createdAt.toISOString(), unread, lead: m.lead });
    else c.unread += unread;
  }

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        subtitle="Every conversation with leads — automated and manual."
        actions={
          <Link href="/settings?tab=templates" className="text-sm font-medium text-sun-700 hover:underline">
            Manage templates
          </Link>
        }
      />
      <Inbox conversations={Array.from(convos.values())} templates={templates} initialLead={lead} connected={Boolean(org.waPhoneNumberId && org.waAccessToken)} />
    </div>
  );
}

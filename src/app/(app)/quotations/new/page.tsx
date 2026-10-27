import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { orgSettings } from "@/lib/api";
import { can } from "@/lib/rbac";
import { loadQuoteContext } from "@/lib/services/quote-page";
import { PageHeader } from "@/components/ui";
import { QuoteBuilder } from "@/components/quotes/quote-builder";

export const metadata = { title: "New quotation" };

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ leadId?: string; mode?: string }> }) {
  const session = await requirePageSession("quotations:review");
  const { leadId, mode } = await searchParams;
  const m = mode === "field" ? "FIELD" : "OFFICE";

  if (!leadId) {
    const [settings, users] = await Promise.all([
      orgSettings(session.orgId),
      db.user.findMany({
        where: { organizationId: session.orgId, active: true, role: { in: ["TELECALLER", "FIELD_SALES", "SALES_MANAGER"] } },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return (
      <div>
        <PageHeader title="New quotation" subtitle="Quoting a new customer — a lead is created for them automatically." />
        <QuoteBuilder lead={null} settings={settings} mode={m} appointment={null} users={users} canAssign={can(session.role, "leads:assign")} />
      </div>
    );
  }

  const [{ lead, appointment }, settings] = await Promise.all([loadQuoteContext(session, leadId), orgSettings(session.orgId)]);
  return (
    <div>
      <PageHeader title="New quotation" subtitle={`${lead.name} · ${lead.code}`} />
      <QuoteBuilder lead={lead} settings={settings} mode={m} appointment={appointment} />
    </div>
  );
}

import { requirePageSession } from "@/lib/auth";
import { orgSettings } from "@/lib/api";
import { loadQuoteContext } from "@/lib/services/quote-page";
import { PageHeader } from "@/components/ui";
import { QuoteBuilder } from "@/components/quotes/quote-builder";

export const metadata = { title: "New quotation" };

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ leadId?: string; mode?: string }> }) {
  const session = await requirePageSession("quotations:review");
  const { leadId, mode } = await searchParams;
  const m = mode === "field" ? "FIELD" : "OFFICE";

  if (!leadId) {
    const settings = await orgSettings(session.orgId);
    return (
      <div>
        <PageHeader title="New quotation" subtitle="Quoting a new customer — a lead is created for them automatically." />
        <QuoteBuilder lead={null} settings={settings} mode={m} appointment={null} />
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

import { requirePageSession } from "@/lib/auth";
import { orgSettings } from "@/lib/api";
import { loadQuoteContext } from "@/lib/services/quote-page";
import { PageHeader } from "@/components/ui";
import { QuoteBuilder } from "@/components/quotes/quote-builder";

export const metadata = { title: "On-site quotation" };

export default async function FieldQuotePage({ params }: { params: Promise<{ leadId: string }> }) {
  const session = await requirePageSession("quotations:create");
  const { leadId } = await params;
  const [{ lead, appointment }, settings] = await Promise.all([loadQuoteContext(session, leadId), orgSettings(session.orgId)]);
  return (
    <div>
      <PageHeader eyebrow="GPS-verified" title="On-site quotation" subtitle={`${lead.name} · ${lead.code}`} />
      <QuoteBuilder lead={lead} settings={settings} mode="FIELD" appointment={appointment} />
    </div>
  );
}

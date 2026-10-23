import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseSettings } from "@/lib/settings";
import { ProposalDocument } from "@/components/quotes/proposal-document";
import { logActivity, notify } from "@/lib/activity";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your solar proposal", robots: { index: false, follow: false } };

/** Customer-facing proposal. Access is by unguessable share token only; first view is tracked. */
export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) notFound();
  const q = await db.quotation.findUnique({
    where: { shareToken: token },
    include: { lead: true, organization: true, createdBy: { select: { id: true, name: true, phone: true } } },
  });
  if (!q) notFound();

  if (!q.viewedAt) {
    await db.quotation.update({ where: { id: q.id }, data: { viewedAt: new Date() } });
    await logActivity({ orgId: q.organizationId, leadId: q.leadId, type: "QUOTATION", title: `Customer opened proposal ${q.number}` });
    await notify(q.organizationId, q.lead.assignedToId ?? q.createdById, `👀 ${q.lead.name} opened the proposal`, `${q.number} — good time to call`, `/leads/${q.leadId}`);
  }
  const s = parseSettings(q.organization.settings);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 sm:py-10 print:bg-white print:p-0">
      {q.status === "EXPIRED" && (
        <div className="mx-auto mb-4 max-w-[860px] rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This proposal has expired. Please contact {q.createdBy.name} for updated pricing.
        </div>
      )}
      <ProposalDocument q={{ ...q, lead: q.lead, org: q.organization, createdBy: q.createdBy }} escalationPct={s.tariffEscalationPct} degradationPct={s.degradationPct} />
      <div className="no-print mx-auto mt-4 flex max-w-[860px] justify-center gap-2">
        <PrintButton />
        {q.createdBy.phone && (
          <a
            href={`https://wa.me/${q.createdBy.phone}?text=${encodeURIComponent(`Hi ${q.createdBy.name}, I have seen proposal ${q.number}. I'd like to proceed / have a question.`)}`}
            className="inline-flex h-10 items-center rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Reply on WhatsApp
          </a>
        )}
      </div>
    </main>
  );
}

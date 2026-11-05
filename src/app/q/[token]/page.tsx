import crypto from "node:crypto";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseSettings } from "@/lib/settings";
import { ProposalDocument } from "@/components/quotes/proposal-document";
import { QuotationDocument, docCompany } from "@/components/quotes/quotation-document";
import { isQuotifySnapshot } from "@/lib/solar/quotify";
import { logActivity, notify } from "@/lib/activity";
import { PrintButton } from "./print-button";
import { CustomQuotation } from "@/components/quotes/custom-quotation";
import { renderedQuotationHtml } from "@/lib/services/quote-templates";

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
    await notify(q.organizationId, q.lead.assignedToId ?? q.createdById, `👀 ${q.lead.name} opened the proposal`, `${q.number} · good time to call`, `/leads/${q.leadId}`);
  }
  const s = parseSettings(q.organization.settings);
  // Native 3D: the customer's latest roof design, embedded in the proposal (share link made on demand).
  let design = await db.solarDesign.findFirst({ where: { leadId: q.leadId, organizationId: q.organizationId, panelCount: { gt: 0 } }, orderBy: { updatedAt: "desc" }, select: { id: true, shareToken: true } });
  if (design && !design.shareToken) {
    design = await db.solarDesign.update({ where: { id: design.id }, data: { shareToken: crypto.randomBytes(18).toString("base64url") }, select: { id: true, shareToken: true } });
  }
  const customHtml = isQuotifySnapshot(q.quoteData)
    ? await renderedQuotationHtml(q.organizationId, q.quoteData, { number: q.number, version: q.version, createdAt: q.createdAt, validityDays: s.quotationValidityDays, company: docCompany(q.organization, s) })
    : null;

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 sm:py-10 print:bg-white print:p-0">
      {q.status === "EXPIRED" && (
        <div className="mx-auto mb-4 max-w-[860px] rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This proposal has expired. Please contact {q.createdBy.name} for updated pricing.
        </div>
      )}
      {customHtml ? (
        <CustomQuotation html={customHtml} className="mx-auto max-w-[900px]" />
      ) : isQuotifySnapshot(q.quoteData) ? (
        <QuotationDocument snap={q.quoteData} number={q.number} version={q.version} createdAt={q.createdAt} company={docCompany(q.organization, s)} />
      ) : (
        <ProposalDocument q={{ ...q, lead: q.lead, org: q.organization, createdBy: q.createdBy }} escalationPct={s.tariffEscalationPct} degradationPct={s.degradationPct} />
      )}
      {design?.shareToken && (
        <section className="no-print mx-auto mt-6 max-w-[900px] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between px-5 py-3">
            <div>
              <h2 className="font-semibold text-slate-800">Interactive 3D design of your roof</h2>
              <p className="text-xs text-slate-500">Drag to look around. See exactly where the panels go and how the sun moves over your home.</p>
            </div>
            <a href={`/d/${design.shareToken}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white">Open full view</a>
          </div>
          <iframe title="3D roof design" src={`/d/${design.shareToken}?embed=1`} className="block h-[460px] w-full border-0" loading="lazy" />
        </section>
      )}
      <div className="no-print mx-auto mt-4 flex max-w-[860px] justify-center gap-2">
        {!customHtml && <PrintButton />}
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

import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ApiError } from "@/lib/errors";
import { loadAgreementContext } from "@/lib/services/agreements";
import { agreementNotReady, type AgreementData } from "@/lib/solar/agreement";
import { isQuotifySnapshot } from "@/lib/solar/quotify";
import { AgreementWorkspace } from "@/components/quotes/agreement-workspace";

export const metadata = { title: "Agreement" };

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession("quotations:create");
  const { id } = await params;
  const ctx = await loadAgreementContext(session, id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const { q, rootId, accepted, latest, cfg } = ctx;
  if (!accepted) notFound();
  const snap = isQuotifySnapshot(accepted.quoteData) ? accepted.quoteData : null;

  return (
    <AgreementWorkspace
      quotationId={rootId}
      quoteNumber={accepted.number}
      customer={q.lead.name}
      initial={latest ? { id: latest.id, createdAt: latest.createdAt.toISOString(), createdByName: latest.createdByName, data: latest.data as unknown as AgreementData } : null}
      defaults={{
        cust_name: snap?.customer.name || q.lead.name,
        cust_address: snap?.customer.address || [q.lead.address, q.lead.city].filter(Boolean).join(", "),
        pincode: snap?.customer.pincode || q.lead.pincode || "",
        total: Math.round(accepted.totalAmount),
        stages: cfg.stages,
        stamp: cfg.stamp,
      }}
      notReady={agreementNotReady(cfg)}
      canEditSettings={can(session, "settings:manage")}
    />
  );
}

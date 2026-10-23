"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Send, CheckCircle2, XCircle, Link2, ShieldCheck } from "lucide-react";
import { Button } from "../ui";
import { Modal } from "../modal";
import { api } from "@/lib/client";
import { useToast } from "../toast";

export function QuoteActions({ id, status, shareToken, canAccept }: { id: string; status: string; shareToken: string | null; canAccept: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const r = await api<{ whatsapp?: { status: string; waLink: string } | null }>(`/api/quotations/${id}`, { body: { action, ...body } });
      if (r?.whatsapp?.status === "SIMULATED") window.open(r.whatsapp.waLink, "_blank");
      toast.success(action === "send" ? "Proposal shared with customer" : action === "accept" ? "🎉 Accepted — deal won & project opened" : "Quotation updated");
      router.refresh();
    } catch (e) {
      toast.error("Action failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> Print / PDF
      </Button>
      {shareToken && (
        <Button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/q/${shareToken}`).then(() => toast.success("Customer link copied"))}>
          <Link2 className="h-4 w-4" /> Copy link
        </Button>
      )}
      {["DRAFT", "SENT"].includes(status) && (
        <Button variant="primary" onClick={() => act("send")} loading={busy === "send"}>
          <Send className="h-4 w-4" /> {status === "SENT" ? "Resend" : "Send"} on WhatsApp
        </Button>
      )}
      {canAccept && ["DRAFT", "SENT"].includes(status) && (
        <>
          <Button onClick={() => act("accept")} loading={busy === "accept"} className="text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Accepted
          </Button>
          <Button onClick={() => act("reject")} loading={busy === "reject"} className="text-rose-700">
            <XCircle className="h-4 w-4" /> Rejected
          </Button>
        </>
      )}
    </div>
  );
}

export function ReviewValidation({ id, hasCapture, reviewed }: { id: string; hasCapture: boolean; reviewed: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pin, setPin] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(approve: boolean) {
    setBusy(true);
    try {
      await api(`/api/quotations/${id}`, { body: { action: "review", approve, note: note || undefined, pinSiteFromCapture: approve && pin } });
      toast.success(approve ? "Validation approved" : "Validation rejected");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error("Review failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <ShieldCheck className="h-4 w-4" /> {reviewed ? "Re-review" : "Review"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Review location validation"
        subtitle="Approve with a reason (e.g. customer met at their shop nearby) or reject to flag the salesperson."
        footer={
          <>
            <Button variant="danger" onClick={() => submit(false)} loading={busy}>
              Reject
            </Button>
            <Button variant="primary" onClick={() => submit(true)} loading={busy}>
              Approve
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / note for audit trail" />
          {hasCapture && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} className="mt-0.5 accent-amber-500" />
              <span>
                Use this capture as the confirmed customer site location
                <span className="block text-xs text-slate-500">Only if you have verified (call / photo) that the capture point is the customer&apos;s roof.</span>
              </span>
            </label>
          )}
        </div>
      </Modal>
    </>
  );
}

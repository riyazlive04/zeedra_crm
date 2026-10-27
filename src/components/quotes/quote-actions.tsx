"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Send, CheckCircle2, XCircle, Link2, ShieldCheck, FilePenLine } from "lucide-react";
import { Button, Field } from "../ui";
import { Modal } from "../modal";
import { NumberInput } from "../form-controls";
import { api } from "@/lib/client";
import { useToast } from "../toast";

export function QuoteActions({ id, status, shareToken, canAccept, canRevise }: { id: string; status: string; shareToken: string | null; canAccept: boolean; canRevise?: boolean }) {
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
      {canRevise && status !== "ACCEPTED" && <ReviseQuotation id={id} />}
    </div>
  );
}

function ReviseQuotation({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [discount, setDiscount] = useState<number | null>(null);
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const r = await api<{ quotation: { id: string; number: string } }>(`/api/quotations/${id}`, {
        body: {
          action: "revise",
          discount: discount ?? undefined,
          manualTotalOverride: finalPrice ?? undefined,
          notes: notes || undefined,
        },
      });
      toast.success(`Quotation ${r.quotation.number} revised`, "The original is kept as a snapshot; this new version is a fresh draft.");
      setOpen(false);
      router.push(`/quotations/${r.quotation.id}`);
      router.refresh();
    } catch (e) {
      toast.error("Could not revise", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FilePenLine className="h-4 w-4" /> Revise
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Revise quotation"
        subtitle="System size stays the same — change the discount, set a final negotiated price, or update notes. The current version is kept as-is."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={busy}>
              Create revision
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="New discount (pre-GST)" hint="Leave blank to keep the current discount">
            <NumberInput prefix="₹" value={discount} onChange={setDiscount} placeholder="Unchanged" />
          </Field>
          <Field label="Set a final price" hint="Overrides the computed total — GST is backed out automatically">
            <NumberInput prefix="₹" value={finalPrice} onChange={setFinalPrice} placeholder="Unchanged" />
          </Field>
          <Field label="Notes on the proposal">
            <textarea className="input min-h-[64px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Leave blank to keep the current notes" />
          </Field>
        </div>
      </Modal>
    </>
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

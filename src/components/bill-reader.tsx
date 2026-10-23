"use client";

import { useRef, useState } from "react";
import { ScanLine, Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "./toast";

export interface BillFields {
  consumerName: string | null;
  consumerNumber: string | null;
  discom: string | null;
  monthlyBill: number | null;
  monthlyUnits: number | null;
  sanctionedLoadKw: number | null;
  phase: "SINGLE" | "THREE" | null;
  address: string | null;
  billingPeriodMonths: number | null;
  confidence: "high" | "medium" | "low";
  notes: string;
}

/** Snap or upload the EB bill — AI reads units, amount, load, DISCOM and consumer number. */
export function BillReader({ onExtract, compact }: { onExtract: (f: BillFields) => void; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function handle(file: File) {
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await api<BillFields>("/api/ai/bill-extract", { form });
      onExtract(r);
      const period = r.billingPeriodMonths && r.billingPeriodMonths > 1 ? ` (bi-monthly bill converted to monthly)` : "";
      toast.success(`Bill read — ${r.confidence} confidence`, `${r.monthlyUnits ?? "?"} units/month · ₹${r.monthlyBill ?? "?"}/month${period}`);
      if (r.notes) toast.info("Note from AI", r.notes);
    } catch (e) {
      toast.error("Could not read the bill", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={loading}
        className={
          compact
            ? "inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-60"
            : "flex w-full items-center gap-3 rounded-xl border border-dashed border-violet-300 bg-gradient-to-r from-violet-50 to-white p-3 text-left hover:border-violet-400 disabled:opacity-60"
        }
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> : <ScanLine className="h-4 w-4 text-violet-600" />}
        {compact ? (
          loading ? "Reading bill…" : "Read EB bill with AI"
        ) : (
          <span>
            <span className="block text-sm font-semibold text-violet-800">{loading ? "Reading the bill…" : "Scan electricity bill with AI"}</span>
            <span className="block text-xs text-violet-600/80">Photo or PDF — fills units, amount, load, DISCOM & consumer no.</span>
          </span>
        )}
      </button>
    </>
  );
}

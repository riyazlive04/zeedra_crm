"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronLeft, Download, FilePenLine, Plus, X } from "lucide-react";
import { Button, Card, CardHeader, Field } from "../ui";
import { api } from "@/lib/client";
import { useToast } from "../toast";
import { stgTotal, type AgreementData, type PaymentStage } from "@/lib/solar/agreement";
import { AgreementPages } from "./agreement-pages";

export interface AgreementRecord {
  id: string;
  createdAt: string;
  createdByName: string | null;
  data: AgreementData;
}

export interface AgreementDefaults {
  cust_name: string;
  cust_address: string;
  pincode: string;
  total: number;
  stages: PaymentStage[];
  stamp: boolean;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function AgreementWorkspace({
  quotationId,
  quoteNumber,
  customer,
  initial,
  defaults,
  notReady,
  canEditSettings,
}: {
  quotationId: string;
  quoteNumber: string;
  customer: string;
  initial: AgreementRecord | null;
  defaults: AgreementDefaults;
  notReady: string;
  canEditSettings: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rec, setRec] = useState<AgreementRecord | null>(initial);
  const [editing, setEditing] = useState(!initial);
  const base = rec?.data;

  const [date, setDate] = useState(today());
  const [name, setName] = useState(base?.cust_name ?? defaults.cust_name);
  const [addr, setAddr] = useState(base?.cust_address ?? defaults.cust_address);
  const [pin, setPin] = useState(base?.pincode ?? defaults.pincode);
  const [father, setFather] = useState(base?.father ?? "");
  const [aadhaar, setAadhaar] = useState("");
  const [total, setTotal] = useState(String(base?.total ?? defaults.total ?? ""));
  const [advance, setAdvance] = useState(String(base?.advance ?? 0));
  const [stages, setStages] = useState((base?.stages ?? defaults.stages).map((s) => ({ ...s, pct: String(s.pct) })));
  const [stamp, setStamp] = useState(base?.stamp ?? defaults.stamp);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const sum = stgTotal(stages.map((s) => ({ ...s, pct: Number(s.pct) || 0 })));

  async function create() {
    setErr("");
    setBusy(true);
    try {
      const r = await api<AgreementRecord>(`/api/quotations/${quotationId}/agreement`, {
        body: {
          date,
          cust_name: name,
          cust_address: addr,
          pincode: pin,
          father,
          aadhaar,
          total: Math.round(Number(total) || 0),
          advance: Math.round(Number(advance) || 0),
          stages: stages.map((s) => ({ name: s.name, pct: Number(s.pct) || 0, when: s.when })),
          stamp,
        },
      });
      setRec(r);
      setEditing(false);
      setAadhaar("");
      toast.success(base ? "Agreement changed" : "Agreement created", "Print it, and both parties sign every page.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the agreement");
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link href={`/quotations/${quotationId}`} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
          <ChevronLeft className="h-3.5 w-3.5" /> {quoteNumber}
        </Link>
        <h1 className="font-display text-2xl font-bold">Agreement</h1>
        <div className="text-sm text-slate-500">{customer}</div>
      </div>
      {rec && !editing && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setEditing(true)}>
            <FilePenLine className="h-4 w-4" /> Change
          </Button>
          <Button size="sm" variant="primary" onClick={() => window.print()}>
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      )}
    </div>
  );

  if (notReady && editing) {
    return (
      <div className="mx-auto max-w-xl">
        {header}
        <Card className="p-5">
          <p className="text-sm font-semibold text-amber-800">Fill your agreement details first.</p>
          <p className="mt-1 text-sm text-slate-600">{notReady}</p>
          {canEditSettings ? (
            <Link href="/settings?tab=agreement" className="mt-3 inline-flex h-9 items-center rounded-lg bg-ink-900 px-3.5 text-sm font-medium text-white">
              Open Settings → Agreement
            </Link>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Agreement details are not filled yet. Ask your admin.</p>
          )}
        </Card>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="mx-auto max-w-xl">
        {header}
        <Card>
          <CardHeader title="Agreement" subtitle={`${customer} · ${quoteNumber}`} />
          <div className="space-y-4 p-5">
            <Field label="Agreement date">
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Customer name(s)">
              <input className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Customer address">
              <textarea className="input min-h-[60px]" rows={2} maxLength={300} value={addr} onChange={(e) => setAddr(e.target.value)} />
            </Field>
            <Field label="PIN code">
              <input className="input" type="tel" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Father's / husband's name (optional)">
              <input className="input" maxLength={80} value={father} onChange={(e) => setFather(e.target.value)} />
            </Field>
            <Field
              label="Aadhaar number (optional)"
              hint={base?.aadhaar ? `Saved as ${base.aadhaar}. Type it again to print the full number, or leave it empty to print it like this.` : "Printed in full on the PDF. Only the last 4 digits are saved."}
            >
              <input className="input" type="tel" inputMode="numeric" maxLength={14} autoComplete="off" value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Total project cost (₹)">
                <input className="input" type="number" min={1} step={1} inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} />
              </Field>
              <Field label="Advance already received (₹)">
                <input className="input" type="number" min={0} step={1} inputMode="numeric" value={advance} onChange={(e) => setAdvance(e.target.value)} />
              </Field>
            </div>
            <div>
              <div className="label">Payment stages</div>
              <StagesEditor stages={stages} setStages={setStages} />
              <div className={clsx("mt-1 text-xs font-semibold", sum === 100 ? "text-emerald-700" : "text-rose-600")}>
                Total: {sum}%{sum === 100 ? " ✓" : " (must be 100%)"}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4" checked={stamp} onChange={(e) => setStamp(e.target.checked)} /> Stamp paper: leave the top half of page 1 blank
            </label>
            {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{err}</p>}
            <div className="flex justify-end gap-2">
              {rec && <Button onClick={() => setEditing(false)}>Cancel</Button>}
              <Button variant="primary" loading={busy} onClick={create}>
                Create agreement
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {header}
      {rec && (
        <>
          <p className="no-print mx-auto mb-4 max-w-[210mm] text-sm text-slate-600">
            Made {new Date(rec.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
            {rec.createdByName ? ` by ${rec.createdByName}` : ""}. Print it, and both parties sign every page. Tap Change to make a new version.
            {rec.data.aadhaar.startsWith("XXXX") && " Aadhaar is saved as the last 4 digits only: to print the full number, tap Change and type it."}
          </p>
          <div className="overflow-x-auto print:overflow-visible">
            <AgreementPages data={rec.data} />
          </div>
        </>
      )}
    </div>
  );
}

type StageRow = { name: string; pct: string; when: string };

/** Payment stage editor — used for one customer here and for the defaults in Settings → Agreement. */
export function StagesEditor({ stages, setStages }: { stages: StageRow[]; setStages: (s: StageRow[]) => void }) {
  return (
    <div className="space-y-2">
      {stages.map((st, i) => (
        <div key={i} className="space-y-1.5 rounded-xl border border-slate-200 p-3">
          <div className="flex gap-2">
            <input className="input flex-1" maxLength={80} placeholder="Stage, e.g. Booking advance" value={st.name} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input type="number" className="input w-20" min={0} max={100} step={0.5} inputMode="decimal" placeholder="%" value={st.pct} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} />
            <button type="button" onClick={() => setStages(stages.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600" aria-label={`Remove stage ${i + 1}`}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            className="input min-h-[52px]"
            maxLength={300}
            placeholder="When it is paid, e.g. at the time of booking and confirmation of the project"
            value={st.when}
            onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)))}
          />
        </div>
      ))}
      <Button size="xs" onClick={() => setStages([...stages, { name: "", pct: "", when: "" }])}>
        <Plus className="h-3 w-3" /> Add stage
      </Button>
    </div>
  );
}

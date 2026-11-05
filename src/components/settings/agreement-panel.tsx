"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button, Card, CardHeader, Field } from "../ui";
import { api } from "@/lib/client";
import { useToast } from "../toast";
import type { OrgSettings } from "@/lib/settings";
import { AGR_BLOCKS, AGR_FIELDS, AGR_TEXT, agrTextProblem, stgProblem } from "@/lib/solar/agreement";
import { StagesEditor } from "../quotes/agreement-workspace";

/** Settings → Agreement: who the second party is, the default payment stages, and the agreement text. */
export function AgreementPanel({ settings, org }: { settings: OrgSettings; org: { name: string; address: string | null } }) {
  const router = useRouter();
  const toast = useToast();
  const a = settings.agreement;
  const [vendorName, setVendorName] = useState(a.vendorName || org.name);
  const [vendorAddress, setVendorAddress] = useState(a.vendorAddress || org.address || "");
  const [stages, setStages] = useState(settings.quotation.paymentStages.map((s) => ({ ...s, pct: String(s.pct) })));
  const [stamp, setStamp] = useState(a.stamp);
  const [text, setText] = useState(a.text || AGR_TEXT);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  const parsedStages = stages
    .map((s) => ({ name: s.name.trim(), pct: Number(s.pct) || 0, when: s.when.trim().replace(/\.+$/, "") }))
    .filter((s) => s.name || s.pct || s.when);
  const sum = Math.round(parsedStages.reduce((t, s) => t + s.pct, 0) * 100) / 100;

  // Tap where the detail should go in the text, then tap the detail.
  function insert(key: string) {
    const el = ta.current;
    const v = text;
    const tag = "{" + key + "}";
    const s = el?.selectionStart ?? v.length;
    const e = el?.selectionEnd ?? s;
    const ins = AGR_BLOCKS.includes(key) ? (s > 0 && v[s - 1] !== "\n" ? "\n" : "") + tag + (v[e] !== "\n" ? "\n" : "") : tag;
    const next = v.slice(0, s) + ins + v.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + ins.length, s + ins.length);
    });
  }

  async function save() {
    setErr("");
    const t = text.trim() || AGR_TEXT;
    const problem = !vendorName.trim() || !vendorAddress.trim() ? "Fill your company legal name and registered office address." : stgProblem(parsedStages) || agrTextProblem(t);
    if (problem) return setErr(problem);
    setBusy(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: {
          settings: {
            agreement: { vendorName: vendorName.trim(), vendorAddress: vendorAddress.trim(), stamp, text: t === AGR_TEXT ? "" : t },
            quotation: { ...settings.quotation, paymentStages: parsedStages },
          },
        },
      });
      toast.success("Saved for the whole team");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Your company" subtitle="Printed on every agreement as the second party." />
        <div className="space-y-4 p-5">
          <Field label="Company legal name">
            <input className="input" maxLength={120} value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g. ABC Solar Private Limited" />
          </Field>
          <Field label="Registered office address">
            <textarea className="input min-h-[70px]" maxLength={300} value={vendorAddress} onChange={(e) => setVendorAddress(e.target.value)} placeholder="Door no, street, area, district - PIN" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Agreement" subtitle="Used for the consumer-vendor agreement made after the customer accepts. Saved for the whole team." />
        <div className="space-y-5 p-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-sky-800">Default payment stages</div>
            <p className="mb-2 text-xs text-slate-500">Percent of the total project cost. They must add up to 100%. Salesmen can change them for one customer. Also printed as Payment Terms on every quotation.</p>
            <StagesEditor stages={stages} setStages={setStages} />
            <div className={clsx("mt-1 text-xs font-semibold", sum === 100 ? "text-emerald-700" : "text-rose-600")}>
              Total: {sum}%{sum === 100 ? " ✓" : " (must be 100%)"}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-4 w-4" checked={stamp} onChange={(e) => setStamp(e.target.checked)} /> Print on stamp paper: leave the top half of page 1 blank
          </label>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-sky-800">Agreement text</div>
            <p className="mb-2 text-xs text-slate-500">Tap where the detail should go in the text below, then tap the detail. The app fills it in for each customer.</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {AGR_FIELDS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(k)}
                  className={clsx("rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50", AGR_BLOCKS.includes(k) && "border-dashed")}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mb-1.5 text-[11px] text-slate-500"># title · ## centred line · ### underlined heading · &quot;- &quot; numbered clause · &gt; small note · **bold**.</p>
            <textarea ref={ta} spellCheck={false} className="input min-h-[300px] font-mono text-xs leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
            <Button size="sm" className="mt-2" onClick={() => setText(AGR_TEXT)}>
              Reset to the standard PM Surya Ghar text
            </Button>
          </div>
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{err}</p>}
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-3">
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}

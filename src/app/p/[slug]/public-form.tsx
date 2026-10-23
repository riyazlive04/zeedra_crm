"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { sizeSystem } from "@/lib/solar/sizing";
import type { OrgSettings } from "@/lib/settings";
import { formatINR } from "@/lib/text";

const SOURCE_MAP: Record<string, string> = { facebook: "FACEBOOK", fb: "FACEBOOK", instagram: "INSTAGRAM", ig: "INSTAGRAM", google: "GOOGLE_ADS", whatsapp: "WHATSAPP" };

export function PublicLeadForm({ slug, orgName, settings, campaign, source }: { slug: string; orgName: string; settings: OrgSettings; campaign: string | null; source: string | null }) {
  const [bill, setBill] = useState(2500);
  const [f, setF] = useState({ name: "", phone: "", city: "", ownsProperty: true, website: "" });
  const [consent, setConsent] = useState(true);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [ref, setRef] = useState("");
  const est = useMemo(() => sizeSystem({ monthlyBill: bill, segment: "RESIDENTIAL" }, settings), [bill, settings]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgSlug: slug,
          name: f.name,
          phone: f.phone,
          city: f.city || null,
          monthlyBill: bill,
          ownsProperty: f.ownsProperty,
          segment: "RESIDENTIAL",
          source: SOURCE_MAP[(source ?? "").toLowerCase()] ?? "WEBSITE",
          campaign,
          website: f.website,
          consent,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Something went wrong");
      setRef(j.reference);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }

  return (
    <div className="rounded-3xl bg-white p-6 text-slate-900 shadow-2xl sm:p-7">
      {state === "done" ? (
        <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h2 className="mt-3 font-display text-2xl font-bold">Thank you, {f.name.split(" ")[0]}!</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your estimate for a <b>{est.recommendedKw} kW</b> system is ready. A solar advisor from {orgName} will call you shortly to book a free site survey.
          </p>
          <p className="mt-4 text-xs text-slate-400">Reference {ref}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Your average monthly electricity bill</label>
            <div className="font-display text-3xl font-extrabold text-slate-900">{formatINR(bill)}</div>
            <input type="range" min={500} max={20000} step={100} value={bill} onChange={(e) => setBill(Number(e.target.value))} className="mt-2 w-full accent-amber-500" aria-label="Monthly bill" />
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-sun-50 p-3 text-center">
            <div>
              <div className="text-[11px] text-slate-500">System</div>
              <div className="font-display text-lg font-bold">{est.recommendedKw} kW</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Subsidy</div>
              <div className="font-display text-lg font-bold text-emerald-700">{formatINR(est.subsidy)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">You save</div>
              <div className="font-display text-lg font-bold text-sun-700">{formatINR(est.monthlySavings)}/mo</div>
            </div>
          </div>
          <p className="text-center text-xs text-slate-500">
            Net cost after subsidy ≈ <b>{formatINR(est.netCost)}</b> · payback ≈ {est.paybackYears} years
          </p>
          <input className="input h-11" required placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
          <input className="input h-11" required placeholder="WhatsApp number" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />
          <input className="input h-11" placeholder="City / area" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
          <input className="hidden" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} aria-hidden />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">I own the house</span>
            {[true, false].map((v) => (
              <button type="button" key={String(v)} onClick={() => setF({ ...f, ownsProperty: v })} className={`rounded-lg border px-3 py-1 text-xs font-medium ${f.ownsProperty === v ? "border-sun-500 bg-sun-50 text-sun-800" : "border-slate-200 text-slate-500"}`}>
                {v ? "Yes" : "No"}
              </button>
            ))}
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-amber-500" required />I agree to be contacted on WhatsApp and phone about my solar enquiry.
          </label>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button disabled={state === "sending"} className="sun-gradient flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-lg disabled:opacity-60">
            {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" />} Get my free solar plan
          </button>
        </form>
      )}
    </div>
  );
}

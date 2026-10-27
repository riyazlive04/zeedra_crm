import { format } from "date-fns";
import { Sun, Leaf, Landmark, TrendingUp, ShieldCheck } from "lucide-react";
import type { LineItem } from "@/lib/solar/quote";
import { formatINR, formatNumber, displayPhone } from "@/lib/text";
import { BRAND } from "@/lib/brand";
import { PanelLayoutPreview } from "@/components/solar/panel-layout";

export interface ProposalData {
  number: string;
  createdAt: Date;
  validUntil: Date;
  systemKw: number;
  panelBrand: string;
  panelWattage: number;
  panelCount: number;
  panelType: string;
  inverterBrand: string;
  inverterKw: number;
  inverterType: string;
  structureType: string;
  lineItems: unknown;
  subtotal: number;
  discount: number;
  marginAmount: number;
  manualOverride: boolean;
  version: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  subsidyAmount: number;
  netCost: number;
  loanAmount: number | null;
  loanRate: number | null;
  loanTenureMonths: number | null;
  emi: number | null;
  annualGenerationKwh: number;
  annualSavings: number;
  paybackYears: number;
  savings25Years: number;
  co2TonnesPerYear: number;
  notes: string | null;
  terms: string | null;
  geoVerdict: string;
  lead: { name: string; code: string; phone: string; email: string | null; address: string | null; city: string | null; pincode: string | null; discom: string | null; consumerNumber: string | null; monthlyBill: number | null };
  org: { name: string; phone: string | null; email: string | null; address: string | null; gstin: string | null; logoUrl: string | null };
  createdBy: { name: string; phone: string | null };
}

export function ProposalDocument({ q, escalationPct = 3, degradationPct = 0.5 }: { q: ProposalData; escalationPct?: number; degradationPct?: number }) {
  const items = (Array.isArray(q.lineItems) ? q.lineItems : []) as LineItem[];
  let cum = -q.netCost;
  const years = Array.from({ length: 25 }, (_, y) => {
    cum += q.annualSavings * Math.pow(1 - degradationPct / 100, y) * Math.pow(1 + escalationPct / 100, y);
    return { year: y + 1, cumulative: Math.round(cum) };
  });
  const milestones = years.filter((y) => [1, 3, 5, 10, 15, 20, 25].includes(y.year));
  const maxAbs = Math.max(...milestones.map((m) => Math.abs(m.cumulative)), 1);

  return (
    <article className="mx-auto max-w-[860px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card print:rounded-none print:border-0 print:shadow-none">
      <header className="relative overflow-hidden bg-ink-950 px-8 py-8 text-white">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-sun-500/25 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            {q.org.logoUrl ? <img src={q.org.logoUrl} alt={q.org.name} className="mb-3 h-10" /> : <div className="mb-2 font-display text-xl font-bold">{q.org.name}</div>}
            <div className="text-xs leading-relaxed text-slate-400">
              {q.org.address && <div>{q.org.address}</div>}
              {[q.org.phone && displayPhone(q.org.phone), q.org.email].filter(Boolean).join(" · ")}
              {q.org.gstin && <div>GSTIN {q.org.gstin}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-sun-300">Rooftop Solar Proposal</div>
            <div className="font-display text-2xl font-bold">
              {q.number}
              {q.version > 1 && <span className="ml-2 align-middle text-sm font-medium text-sun-300">Rev. {q.version}</span>}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Issued {format(q.createdAt, "d MMM yyyy")} · Valid till {format(q.validUntil, "d MMM yyyy")}
            </div>
          </div>
        </div>
        <div className="relative mt-8 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="text-xs text-slate-400">Prepared for</div>
            <div className="font-display text-xl font-semibold">{q.lead.name}</div>
            <div className="text-xs text-slate-400">
              {[q.lead.address, q.lead.city, q.lead.pincode].filter(Boolean).join(", ")}
              {q.lead.consumerNumber && ` · ${q.lead.discom ?? "EB"} consumer no. ${q.lead.consumerNumber}`}
            </div>
          </div>
          <div className="sun-gradient rounded-2xl px-5 py-3 text-right shadow-lg">
            <div className="text-[11px] font-medium text-white/80">System size</div>
            <div className="font-display text-3xl font-extrabold leading-none">{q.systemKw} kWp</div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
        {[
          ["Net cost after subsidy", formatINR(q.netCost)],
          ["Monthly savings", formatINR(Math.round(q.annualSavings / 12))],
          ["Payback", `${q.paybackYears} years`],
          ["25-year savings", formatINR(q.savings25Years)],
        ].map(([l, v]) => (
          <div key={l} className="bg-white px-5 py-4">
            <div className="text-[11px] font-medium text-slate-500">{l}</div>
            <div className="mt-0.5 font-display text-lg font-bold text-slate-900">{v}</div>
          </div>
        ))}
      </section>

      <div className="space-y-8 px-8 py-8">
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
            <Sun className="h-4 w-4 text-sun-600" /> System & bill of materials
          </h2>
          <div className="mb-3 grid gap-3 text-sm sm:grid-cols-3">
            <Spec label="Solar modules" value={`${q.panelCount} × ${q.panelWattage} Wp ${q.panelBrand}`} sub={q.panelType} />
            <Spec label="Inverter" value={`${q.inverterKw} kW ${q.inverterBrand}`} sub={q.inverterType} />
            <Spec label="Structure" value={q.structureType} sub={`~${formatNumber(q.annualGenerationKwh)} kWh/year generation`} />
          </div>
          <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <PanelLayoutPreview panelCount={q.panelCount} panelWattage={q.panelWattage} systemKw={q.systemKw} />
          </div>
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Specification</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it) => (
                <tr key={it.name}>
                  <td className="px-3 py-2 text-slate-800">{it.name}</td>
                  <td className="px-3 py-2 text-slate-500">{it.spec}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {it.qty} {it.unit}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="mb-3 font-display text-base font-bold">Commercials</h2>
            <dl className="space-y-1.5 text-sm">
              <Row l="System price" v={formatINR(q.subtotal)} />
              {q.discount > 0 && <Row l="Discount" v={`− ${formatINR(q.discount)}`} className="text-emerald-700" />}
              {q.marginAmount > 0 && <Row l="Margin" v={formatINR(q.marginAmount)} />}
              <Row l={`GST (${q.gstRate}% composite)`} v={formatINR(q.gstAmount)} />
              <Row l="Total project cost" v={formatINR(q.totalAmount)} bold />
              {q.manualOverride && <p className="text-[11px] text-slate-400">Final price set directly for this quotation.</p>}
              <Row l="PM Surya Ghar subsidy (credited to you)" v={`− ${formatINR(q.subsidyAmount)}`} className="text-emerald-700" />
              <div className="mt-2 flex items-center justify-between rounded-xl bg-sun-50 px-3 py-2.5">
                <dt className="font-semibold text-sun-900">Effective net cost</dt>
                <dd className="font-display text-lg font-bold text-sun-900">{formatINR(q.netCost)}</dd>
              </div>
            </dl>
            {q.emi && q.loanTenureMonths && (
              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-sky-900">
                  <Landmark className="h-4 w-4" /> Solar loan plan
                </div>
                <div className="mt-1 text-sm text-sky-900">
                  EMI <b className="font-display text-lg">{formatINR(q.emi)}</b>/month for {q.loanTenureMonths / 12} years @ {q.loanRate}% p.a.
                </div>
                <div className="text-xs text-sky-800/80">
                  Loan {formatINR(q.loanAmount)} · Down payment {formatINR(q.netCost - (q.loanAmount ?? 0))} · You save ~{formatINR(Math.round(q.annualSavings / 12))}/month on electricity
                </div>
              </div>
            )}
          </div>
          <div>
            <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
              <TrendingUp className="h-4 w-4 text-emerald-600" /> Your savings over time
            </h2>
            <ul className="space-y-2">
              {milestones.map((m) => (
                <li key={m.year} className="flex items-center gap-3 text-xs">
                  <span className="w-12 shrink-0 text-slate-500">Year {m.year}</span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-50">
                    <div className={`absolute inset-y-0 left-0 rounded ${m.cumulative >= 0 ? "bg-emerald-500" : "bg-slate-300"}`} style={{ width: `${(Math.abs(m.cumulative) / maxAbs) * 100}%` }} />
                  </div>
                  <span className={`w-24 shrink-0 text-right font-semibold tabular-nums ${m.cumulative >= 0 ? "text-emerald-700" : "text-slate-500"}`}>{formatINR(m.cumulative)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">
              Net position after recovering the investment. Assumes {escalationPct}% yearly tariff rise and {degradationPct}% panel degradation.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
              <Leaf className="h-4 w-4" /> Avoids {q.co2TonnesPerYear} tonnes of CO₂ every year — about {formatNumber(Math.round((q.co2TonnesPerYear * 1000) / 21))} trees.
            </div>
          </div>
        </section>

        {q.notes && (
          <section>
            <h2 className="mb-2 font-display text-base font-bold">Notes</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{q.notes}</p>
          </section>
        )}

        {q.terms && (
          <section>
            <h2 className="mb-2 font-display text-base font-bold">Terms & conditions</h2>
            <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
              {q.terms.split("\n").map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </section>
        )}

        <section className="grid gap-6 border-t border-slate-100 pt-6 sm:grid-cols-2">
          <div className="text-xs text-slate-500">
            <div>Your solar advisor</div>
            <div className="text-sm font-semibold text-slate-800">{q.createdBy.name}</div>
            {q.createdBy.phone && <div>{displayPhone(q.createdBy.phone)}</div>}
            {q.geoVerdict === "VERIFIED" && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <ShieldCheck className="h-3 w-3" /> Prepared on-site after roof survey
              </div>
            )}
          </div>
          <div className="text-right text-xs text-slate-500">
            <div className="ml-auto mt-8 w-48 border-t border-slate-300 pt-1">Customer acceptance</div>
          </div>
        </section>
      </div>
      <footer className="border-t border-slate-100 bg-slate-50 px-8 py-3 text-center text-[10px] text-slate-400">Generated with {BRAND.product}</footer>
    </article>
  );
}

function Spec({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="font-semibold text-slate-800">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function Row({ l, v, bold, className }: { l: string; v: string; bold?: boolean; className?: string }) {
  return (
    <div className={`flex items-center justify-between ${className ?? ""}`}>
      <dt className={bold ? "font-semibold text-slate-800" : "text-slate-600"}>{l}</dt>
      <dd className={`tabular-nums ${bold ? "font-semibold text-slate-900" : ""}`}>{v}</dd>
    </div>
  );
}

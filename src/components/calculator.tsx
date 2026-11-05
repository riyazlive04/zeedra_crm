"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Share2 } from "lucide-react";
import { Card, CardHeader, Field, ButtonLink } from "./ui";
import { NumberInput } from "./form-controls";
import { emi as emiFor } from "@/lib/solar/finance";
import type { OrgSettings } from "@/lib/settings";
import {
  calcTNEBBimonthlyBill,
  computeQuotify,
  defaultWattFor,
  fmtINR,
  quotationConfig,
  QuotifyInputError,
  reverseCalcTNEBBimonthlyUnits,
  type Phase,
  type QuotifyResult,
  type Structure,
  type SysType,
} from "@/lib/solar/quotify";

/** Tariffs rise ~6% a year — the same escalation the quotation's 30-year model uses. */
const ESCALATION = 0.06;
const YEARS = 25;
const SOLAR = "#2a78d6"; // categorical slot 1
const EB = "#eb6834"; // categorical slot 2

const SYS: { value: SysType; label: string }[] = [
  { value: "dcr", label: "On-Grid DCR" },
  { value: "ndcr", label: "On-Grid NDCR" },
  { value: "hybrid", label: "Hybrid" },
  { value: "micro", label: "Micro Inverter" },
];

function Toggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className={clsx("grid gap-1.5", options.length > 2 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx("rounded-lg border px-2.5 py-1.5 text-xs font-medium transition", value === o.value ? "border-sun-500 bg-sun-50 text-sun-800 ring-1 ring-sun-500/30" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const lakhs = (v: number) => {
  const l = Math.abs(v) / 100000;
  return "₹" + (l >= 100 ? (l / 100).toFixed(1) + " Cr" : (Number.isInteger(l) ? l : l.toFixed(1)) + "L");
};

interface YearPoint {
  year: number;
  eb: number; // cumulative EB bills without solar
  solar: number; // cumulative down payment + EMIs + remaining EB bills with solar
}

/**
 * Cumulative money out of pocket, year by year: paying the EB bill for life vs. going solar on a
 * loan (down payment, EMIs until the loan ends, and whatever bill is left after solar).
 */
function timeline(ebBimonthly: number, leftBimonthly: number, downPayment: number, emiMonthly: number, tenureMonths: number): YearPoint[] {
  const pts: YearPoint[] = [{ year: 0, eb: 0, solar: downPayment }];
  let eb = 0;
  let solar = downPayment;
  for (let y = 1; y <= YEARS; y++) {
    const esc = Math.pow(1 + ESCALATION, y - 1);
    eb += ebBimonthly * 6 * esc;
    const emiMonths = Math.max(0, Math.min(12, tenureMonths - (y - 1) * 12));
    solar += emiMonthly * emiMonths + leftBimonthly * 6 * esc;
    pts.push({ year: y, eb: Math.round(eb), solar: Math.round(solar) });
  }
  return pts;
}

function SpendChart({ data, emiEndsYear }: { data: YearPoint[]; emiEndsYear: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 260;
  const L = 52;
  const R = 70;
  const T = 14;
  const B = 26;
  const max = Math.max(1, ...data.map((d) => Math.max(d.eb, d.solar)));
  const step = [50000, 100000, 200000, 250000, 500000, 1000000, 2000000, 5000000, 10000000].find((s) => max / s <= 6) ?? 20000000;
  const top = Math.ceil(max / step) * step;
  const x = (yr: number) => L + (yr / YEARS) * (W - L - R);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const path = (k: "eb" | "solar") => data.map((d, i) => `${i ? "L" : "M"}${x(d.year).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const last = data[data.length - 1];
  const h = hover != null ? data[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Money spent over ${YEARS} years: EB bill only ${fmtINR(last.eb)}, with solar ${fmtINR(last.solar)}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          setHover(Math.max(0, Math.min(YEARS, Math.round(((px - L) / (W - L - R)) * YEARS))));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#64748b">
              {lakhs(t)}
            </text>
          </g>
        ))}
        {[0, 5, 10, 15, 20, 25].map((yr) => (
          <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" fontSize="10" fill="#64748b">
            {yr === 0 ? "Today" : `Yr ${yr}`}
          </text>
        ))}
        {emiEndsYear > 0 && emiEndsYear < YEARS && (
          <g>
            <line x1={x(emiEndsYear)} x2={x(emiEndsYear)} y1={T} y2={H - B} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
            <text x={x(emiEndsYear) + 4} y={T + 10} fontSize="10" fill="#475569">
              EMI ends
            </text>
          </g>
        )}
        <path d={path("eb")} fill="none" stroke={EB} strokeWidth={2} strokeLinejoin="round" />
        <path d={path("solar")} fill="none" stroke={SOLAR} strokeWidth={2} strokeLinejoin="round" />
        <text x={x(YEARS) + 6} y={y(last.eb) + 4} fontSize="11" fill="#0f172a" fontWeight={600}>
          {lakhs(last.eb)}
        </text>
        <text x={x(YEARS) + 6} y={y(last.solar) + 4} fontSize="11" fill="#0f172a" fontWeight={600}>
          {lakhs(last.solar)}
        </text>
        {h && (
          <g>
            <line x1={x(h.year)} x2={x(h.year)} y1={T} y2={H - B} stroke="#334155" strokeWidth={1} />
            <circle cx={x(h.year)} cy={y(h.eb)} r={4} fill={EB} stroke="#fff" strokeWidth={2} />
            <circle cx={x(h.year)} cy={y(h.solar)} r={4} fill={SOLAR} stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-card" style={{ left: `${Math.min(70, (x(h.year) / W) * 100)}%` }}>
          <div className="font-semibold text-slate-800">{h.year === 0 ? "Today" : `After ${h.year} year${h.year > 1 ? "s" : ""}`}</div>
          <div className="mt-1 flex items-center gap-1.5 text-slate-600">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: EB }} /> EB bill only: <b className="text-slate-900">{fmtINR(h.eb)}</b>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: SOLAR }} /> With solar: <b className="text-slate-900">{fmtINR(h.solar)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" style={accent ? { borderLeft: `4px solid ${accent}` } : undefined}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 font-display text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  );
}

export function SolarCalculator({ settings }: { settings: OrgSettings }) {
  const cfg = useMemo(() => quotationConfig(settings), [settings]);
  const [sizeMode, setSizeMode] = useState<"eb" | "direct">("eb");
  const [units, setUnits] = useState<number | null>(null);
  const [bill, setBill] = useState<number | null>(4000);
  const [directKw, setDirectKw] = useState<number | null>(null);
  const [systemType, setSystemType] = useState<SysType>("dcr");
  const [structure, setStructure] = useState<Structure>("lowrise");
  const [phase, setPhase] = useState<Phase>("single");
  const [rate, setRate] = useState<number | null>(settings.loanRatePct);
  const [down, setDown] = useState<number | null>(settings.loanDownPaymentPct);
  const [tenure, setTenure] = useState(settings.loanTenureMonths);

  const panelType = systemType === "ndcr" ? "topcon" : "bifacial";
  let r: QuotifyResult | null = null;
  let error = "";
  try {
    r = computeQuotify(
      {
        sizeMode,
        bimonthlyUnits: units,
        bimonthlyBill: units ? null : bill,
        directKw,
        structure,
        dcCableSize: "4",
        acCableSize: "4",
        systemType,
        panelType,
        panelWatt: defaultWattFor(panelType, cfg.P, cfg.custom, systemType),
        inverterPhase: phase,
      },
      cfg.P,
      cfg.custom,
      { stateSubsidy: cfg.stateSubsidy, companyName: "" },
    );
  } catch (e) {
    error = e instanceof QuotifyInputError ? e.message : "Check the inputs";
  }

  // Everything below is per TNEB bill cycle (2 months).
  const ebNow = sizeMode === "eb" ? (units ? Math.round(calcTNEBBimonthlyBill(units)) : bill || null) : null;
  // The quotation values all generation at the top slabs; nobody saves more than their bill, so cap it there.
  const generationValue = r ? Math.round(r.savings.bimonthlySave) : 0;
  const saving = ebNow != null ? Math.min(generationValue, ebNow) : generationValue;
  const ebBase = ebNow ?? saving; // without a bill, compare against the part of the bill solar replaces
  const left = ebNow != null ? Math.max(0, ebNow - saving) : 0;
  const downPayment = r ? Math.round((r.netCost * (down ?? 0)) / 100) : 0;
  const principal = r ? Math.max(0, Math.round(r.netCost) - downPayment) : 0;
  const emiMonthly = emiFor(principal, rate ?? 0, tenure);
  const emiBimonthly = emiMonthly * 2;
  const data = r ? timeline(ebBase, left, downPayment, emiMonthly, tenure) : [];
  const last = data[data.length - 1];
  const kept = last ? last.eb - last.solar : 0;

  const shareText = r
    ? [
        "☀️ Your rooftop solar estimate",
        "",
        `System: ${r.actualKw} kW ${r.sysLabel} (${r.panels} panels)`,
        `Total: ${fmtINR(r.grandTotal)}${r.subsidy ? ` · Subsidy: ${fmtINR(r.subsidy)} · Net: ${fmtINR(r.netCost)}` : ""}`,
        ebNow != null ? `EB bill today: ${fmtINR(ebNow)} every 2 months — for life` : "",
        `Saving: ${fmtINR(saving)} every 2 months`,
        `EMI: ${fmtINR(emiBimonthly)} every 2 months for ${tenure / 12} years — then ₹0`,
        `In ${YEARS} years you keep ~${fmtINR(kept)}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return (
    <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
      <Card className="xl:self-start">
        <CardHeader title="Inputs" subtitle="Bi-monthly, as on the TNEB bill · prices from Settings → Quotation prices" />
        <div className="space-y-4 p-5">
          <Toggle value={sizeMode} onChange={setSizeMode} options={[{ value: "eb", label: "From EB Bill" }, { value: "direct", label: "Enter kW Size" }]} />
          {sizeMode === "eb" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bi-Monthly Units" hint={bill && !units ? `≈ ${Math.round(reverseCalcTNEBBimonthlyUnits(bill))} units` : undefined}>
                <NumberInput suffix="units" value={units} onChange={setUnits} />
              </Field>
              <Field label="Bi-Monthly EB Bill" hint={units ? `≈ ${fmtINR(calcTNEBBimonthlyBill(units))}` : undefined}>
                <NumberInput prefix="₹" value={units ? null : bill} onChange={(v) => { setBill(v); if (v) setUnits(null); }} />
              </Field>
            </div>
          ) : (
            <Field label="System Size (kW)">
              <NumberInput suffix="kW" value={directKw} onChange={setDirectKw} />
            </Field>
          )}
          <Field label="System Type">
            <Toggle value={systemType} onChange={setSystemType} options={SYS} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Structure Type">
              <Toggle value={structure} onChange={setStructure} options={[{ value: "lowrise", label: "Low-Rise" }, { value: "highrise", label: "High-Rise" }]} />
            </Field>
            <Field label="Phase Type">
              <Toggle value={phase} onChange={setPhase} options={[{ value: "single", label: "Single" }, { value: "three", label: "Three" }]} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-sky-50/60 p-3">
            <Field label="Loan rate">
              <NumberInput suffix="%" value={rate} onChange={setRate} />
            </Field>
            <Field label="Down pay">
              <NumberInput suffix="%" value={down} onChange={setDown} />
            </Field>
            <Field label="Tenure">
              <select className="input" value={tenure} onChange={(e) => setTenure(Number(e.target.value))}>
                {[24, 36, 60, 84, 120].map((m) => (
                  <option key={m} value={m}>
                    {m / 12} yrs
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {r && (
            <div className="flex flex-wrap gap-2">
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-500 px-3.5 text-sm font-medium text-white hover:bg-emerald-600">
                <Share2 className="h-4 w-4" /> Share on WhatsApp
              </a>
              <ButtonLink href="/quotations/new">Make a quotation</ButtonLink>
            </div>
          )}
        </div>
      </Card>

      {!r ? (
        <Card className="p-10 text-center text-sm text-slate-500">{error || "Enter the bi-monthly units or bill amount."}</Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader title={r.title} subtitle={`${r.panels} × ${r.panelWatt}W panels · ${r.inverterLabel ? `${r.inverterLabel} inverter` : "micro inverters"}`} />
            <div className="grid gap-px bg-slate-100 sm:grid-cols-4">
              {[
                ["TOTAL (Incl. GST)", fmtINR(r.grandTotal)],
                ["Govt subsidy", r.subsidy ? `− ${fmtINR(r.subsidy)}` : "—"],
                ["Net cost", fmtINR(r.netCost)],
                ["Payback", `${r.savings.paybackYrs.toFixed(1)} yrs`],
              ].map(([l, v]) => (
                <div key={l} className="bg-white px-5 py-3">
                  <div className="text-[11px] font-medium text-slate-500">{l}</div>
                  <div className="font-display text-lg font-bold text-slate-900">{v}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="EMI vs EB bill" subtitle="Every amount is per TNEB bill cycle — 2 months" />
            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Tile label="EB bill today" value={ebNow != null ? fmtINR(ebNow) : "—"} sub="Every 2 months, for life — and it rises ~6% a year" accent={EB} />
                <Tile label="Solar EMI" value={fmtINR(emiBimonthly)} sub={`Every 2 months for ${tenure / 12} years — then ₹0`} accent={SOLAR} />
                <Tile label="Bi-monthly saving" value={fmtINR(saving)} sub={ebNow != null ? `New bill ≈ ${fmtINR(left)} every 2 months` : "Off your TNEB bill"} />
                <Tile label="After the EMI ends" value={`+${fmtINR(saving)}`} sub="Yours every 2 months, for 25+ years" />
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {emiBimonthly <= saving ? (
                  <>
                    The EMI (<b>{fmtINR(emiBimonthly)}</b>) is less than the saving (<b>{fmtINR(saving)}</b>), so solar pays for itself <b>from the first bill</b>.
                  </>
                ) : (
                  <>
                    For {tenure / 12} years the EMI is <b>{fmtINR(emiBimonthly - saving)}</b> more than the saving every 2 months. After that the EMI is finished, and you keep <b>{fmtINR(saving)}</b> every 2 months.
                  </>
                )}{" "}
                Over {YEARS} years you keep about <b>{fmtINR(kept)}</b>.
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">Money spent over {YEARS} years</div>
                  <div className="flex gap-4 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-0.5 w-4 rounded" style={{ background: EB }} /> EB bill only
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-0.5 w-4 rounded" style={{ background: SOLAR }} /> With solar (down payment + EMI + remaining bill)
                    </span>
                  </div>
                </div>
                <SpendChart data={data} emiEndsYear={Math.ceil(tenure / 12)} />
                <details className="mt-2 text-xs text-slate-600">
                  <summary className="cursor-pointer select-none">Show as a table</summary>
                  <table className="mt-2 w-full text-right tabular-nums">
                    <thead className="table-head">
                      <tr>
                        <th className="px-2 py-1 text-left">After</th>
                        <th className="px-2 py-1">EB bill only</th>
                        <th className="px-2 py-1">With solar</th>
                        <th className="px-2 py-1">You keep</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.filter((d) => [1, 3, 5, 7, 10, 15, 20, 25].includes(d.year)).map((d) => (
                        <tr key={d.year} className="border-t border-slate-100">
                          <td className="px-2 py-1 text-left">{d.year} yr</td>
                          <td className="px-2 py-1">{fmtINR(d.eb)}</td>
                          <td className="px-2 py-1">{fmtINR(d.solar)}</td>
                          <td className={clsx("px-2 py-1 font-semibold", d.eb - d.solar >= 0 ? "text-emerald-700" : "text-slate-500")}>{fmtINR(d.eb - d.solar)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Pick a tenure" subtitle="Bi-monthly EMI against the bi-monthly saving" />
            <div className="grid gap-px bg-slate-100 sm:grid-cols-5">
              {[24, 36, 60, 84, 120].map((t) => {
                const e2 = emiFor(principal, rate ?? 0, t) * 2;
                const gap = saving - e2;
                return (
                  <button key={t} type="button" onClick={() => setTenure(t)} className={clsx("bg-white p-4 text-left hover:bg-sun-50/40", t === tenure && "ring-2 ring-inset ring-sun-500")}>
                    <div className="text-xs text-slate-500">{t / 12} years</div>
                    <div className="font-display text-lg font-bold">{fmtINR(e2)}</div>
                    <div className={clsx("text-xs font-medium", gap >= 0 ? "text-emerald-700" : "text-amber-700")}>
                      {gap >= 0 ? `${fmtINR(gap)} less than saving` : `${fmtINR(-gap)} more than saving`}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

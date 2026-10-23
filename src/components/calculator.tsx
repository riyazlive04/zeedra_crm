"use client";

import { useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { Card, CardHeader, Field, ButtonLink } from "./ui";
import { NumberInput, Segmented } from "./form-controls";
import { SolarEstimate } from "./solar-estimate";
import { sizeSystem, type SegmentKey } from "@/lib/solar/sizing";
import { loanOptions, loanPlan } from "@/lib/solar/finance";
import type { OrgSettings } from "@/lib/settings";
import { formatINR, humanize } from "@/lib/text";
import { SEGMENTS } from "@/lib/validators";

export function SolarCalculator({ settings }: { settings: OrgSettings }) {
  const [bill, setBill] = useState<number | null>(3000);
  const [units, setUnits] = useState<number | null>(null);
  const [segment, setSegment] = useState<SegmentKey>("RESIDENTIAL");
  const [roof, setRoof] = useState<number | null>(null);
  const [kw, setKw] = useState<number | null>(null);
  const [offset, setOffset] = useState(100);
  const [rate, setRate] = useState<number | null>(settings.loanRatePct);
  const [down, setDown] = useState<number | null>(settings.loanDownPaymentPct);
  const [tenure, setTenure] = useState(settings.loanTenureMonths);

  const r = useMemo(
    () => (bill || units || kw ? sizeSystem({ monthlyBill: bill, monthlyUnits: units, segment, roofAreaSqft: roof, overrideKw: kw, offset: offset / 100 }, settings) : null),
    [bill, units, segment, roof, kw, offset, settings],
  );
  const loan = r ? loanPlan(r.netCost, r.monthlySavings, rate ?? 0, tenure, down ?? 0) : null;
  const options = r ? loanOptions(r.netCost, r.monthlySavings, rate ?? 0, down ?? 0) : [];
  const shareText = r
    ? `☀️ Your rooftop solar estimate\n\nSystem: ${r.recommendedKw} kW (${r.panelCount} panels)\nCost: ${formatINR(r.totalCost)}\nPM Surya Ghar subsidy: ${formatINR(r.subsidy)}\nNet cost: ${formatINR(r.netCost)}\nSavings: ~${formatINR(r.monthlySavings)}/month\nPayback: ~${r.paybackYears} years${loan ? `\nEMI: ${formatINR(loan.emi)}/month for ${tenure / 12} yrs` : ""}`
    : "";

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader title="Inputs" subtitle={`Tariff ₹${settings.tariffPerUnit}/unit · yield ${settings.specificYield} kWh/kWp/yr · edit in Settings`} />
        <div className="space-y-4 p-5">
          <Field label="Segment">
            <Segmented value={segment} onChange={(v) => setSegment((v ?? "RESIDENTIAL") as SegmentKey)} options={SEGMENTS.map((s) => ({ value: s, label: humanize(s) }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly bill">
              <NumberInput prefix="₹" value={bill} onChange={setBill} />
            </Field>
            <Field label="or Monthly units">
              <NumberInput suffix="kWh" value={units} onChange={setUnits} />
            </Field>
            <Field label="Roof area (optional)">
              <NumberInput suffix="sq.ft" value={roof} onChange={setRoof} />
            </Field>
            <Field label="Force size (optional)">
              <NumberInput suffix="kW" value={kw} onChange={setKw} />
            </Field>
          </div>
          <Field label={`Offset ${offset}% of consumption`}>
            <input type="range" min={50} max={120} step={5} value={offset} onChange={(e) => setOffset(Number(e.target.value))} className="w-full accent-amber-500" />
          </Field>
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-sky-50/60 p-3">
            <Field label="Loan rate">
              <NumberInput suffix="%" value={rate} onChange={setRate} />
            </Field>
            <Field label="Down pay">
              <NumberInput suffix="%" value={down} onChange={setDown} />
            </Field>
            <Field label="Tenure">
              <select className="input" value={tenure} onChange={(e) => setTenure(Number(e.target.value))}>
                {[36, 60, 84, 120].map((m) => (
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
              <ButtonLink href="/leads/new">Save as lead</ButtonLink>
            </div>
          )}
        </div>
      </Card>
      <div className="space-y-6">
        {r ? (
          <Card className="p-5">
            <SolarEstimate r={r} loan={loan} />
          </Card>
        ) : (
          <Card className="p-10 text-center text-sm text-slate-500">Enter a bill amount or units.</Card>
        )}
        {r && (
          <Card>
            <CardHeader title="EMI vs savings" subtitle="Which tenure makes solar pay for itself from month one" />
            <div className="grid gap-px bg-slate-100 sm:grid-cols-4">
              {options.map((o) => (
                <div key={o.tenureMonths} className="bg-white p-4">
                  <div className="text-xs text-slate-500">{o.tenureMonths / 12} years</div>
                  <div className="font-display text-lg font-bold">{formatINR(o.emi)}/mo</div>
                  <div className={`text-xs font-medium ${o.monthlyCashflow >= 0 ? "text-emerald-700" : "text-amber-700"}`}>
                    {o.monthlyCashflow >= 0 ? "+" : "−"}
                    {formatINR(Math.abs(o.monthlyCashflow))} vs savings
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

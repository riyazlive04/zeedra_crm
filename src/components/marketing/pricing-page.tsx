"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { PLANS, PLAN_ORDER, TRIAL_DAYS } from "@/lib/billing/plans";
import { formatINR } from "@/lib/text";
import { BRAND } from "@/lib/brand";
import { MarketingNav, MarketingFooter } from "./site-chrome";

const FAQ = [
  { q: "Is there really no credit card required to start?", a: `No. Create a workspace, invite your team and use every ${BRAND.product} feature free for ${TRIAL_DAYS} days. We only ask for billing details when you choose a plan.` },
  { q: "What happens to leads and quotations I've already created if I don't upgrade?", a: "Nothing is deleted. You keep read access to your data; new leads, users and quotations beyond the Starter plan's limits are paused until you pick a plan." },
  { q: "Can I change plans later?", a: "Yes, any time from Settings → Billing. Changes take effect immediately and we prorate your next invoice." },
  { q: "Do you charge per lead or per user?", a: "Per workspace, with a seat limit and a monthly lead limit per plan. Most EPCs comfortably fit within Growth; high-volume teams go on Scale, which is unlimited." },
  { q: "Is GST included?", a: "Prices shown are exclusive of GST (18%), same as how Indian B2B SaaS is typically billed." },
];

export function MarketingPricing() {
  const [yearly, setYearly] = useState(false);
  return (
    <div className="bg-ink-950">
      <MarketingNav />
      <main className="px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-bold text-white">Simple pricing, in rupees</h1>
          <p className="mt-3 text-slate-400">Every plan includes the full sales pipeline, GPS-verified quotations and the subsidy/EMI engine. No setup fee.</p>
          <div className="mx-auto mt-7 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-sm">
            <button onClick={() => setYearly(false)} className={`rounded-full px-4 py-1.5 font-medium transition ${!yearly ? "bg-white text-ink-950" : "text-slate-300"}`}>
              Monthly
            </button>
            <button onClick={() => setYearly(true)} className={`rounded-full px-4 py-1.5 font-medium transition ${yearly ? "bg-white text-ink-950" : "text-slate-300"}`}>
              Yearly <span className="text-emerald-500">· save ~17%</span>
            </button>
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-5 lg:grid-cols-4">
          {PLAN_ORDER.map((id) => {
            const p = PLANS[id];
            const price = yearly ? Math.round(p.priceYearly / 12) : p.priceMonthly;
            const highlighted = id === "GROWTH";
            return (
              <div key={id} className={`flex flex-col rounded-2xl border p-6 ${highlighted ? "border-sun-400/50 bg-white/[0.06] shadow-[0_0_0_1px_rgba(251,191,36,0.3)]" : "border-white/10 bg-white/[0.03]"}`}>
                {highlighted && <span className="mb-3 inline-block w-fit rounded-full bg-sun-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-sun-300">Most popular</span>}
                <h3 className="font-display text-lg font-bold text-white">{p.name}</h3>
                <p className="mt-1 text-xs text-slate-400">{p.tagline}</p>
                <div className="mt-4 font-display text-3xl font-bold text-white">
                  {formatINR(price)}
                  <span className="text-sm font-normal text-slate-400">/mo + GST</span>
                </div>
                {yearly && <p className="mt-0.5 text-[11px] text-slate-500">Billed {formatINR(p.priceYearly)}/year</p>}
                <Link href="/register" className={`mt-5 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${highlighted ? "sun-gradient text-white" : "border border-white/15 text-white hover:bg-white/5"}`}>
                  Start free trial <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h3 className="font-display text-lg font-bold text-white">Enterprise</h3>
            <p className="mt-1 text-xs text-slate-400">For large channel-partner networks and franchise groups</p>
            <div className="mt-4 font-display text-3xl font-bold text-white">Custom</div>
            <p className="mt-0.5 text-[11px] text-slate-500">Volume pricing, invoicing terms</p>
            <a href={`mailto:${BRAND.supportEmail}?subject=Enterprise plan`} className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-white/15 text-sm font-semibold text-white hover:bg-white/5">
              Talk to us
            </a>
            <ul className="mt-6 flex-1 space-y-2.5">
              {["Everything in Scale", "Custom SLAs & onboarding", "Single sign-on (on request)", "Dedicated account manager"].map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mx-auto mt-20 max-w-2xl">
          <h2 className="text-center font-display text-2xl font-bold text-white">Frequently asked</h2>
          <div className="mt-6 divide-y divide-white/10 rounded-2xl border border-white/10">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="cursor-pointer list-none text-sm font-medium text-white marker:content-none">
                  <span className="flex items-center justify-between">
                    {f.q}
                    <span className="ml-3 text-slate-500 transition group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-2 text-sm text-slate-400">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}

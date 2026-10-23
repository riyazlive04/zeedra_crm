import Link from "next/link";
import {
  ArrowRight, Calculator, Sparkles, MessageCircle, CalendarCheck2, MapPinned, Hammer,
  ShieldCheck, KanbanSquare, Check, Minus, HelpCircle,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { MarketingNav, MarketingFooter } from "./site-chrome";

const FEATURES = [
  { icon: Calculator, title: "EB bill → system size in seconds", body: "kW, panels, inverter, PM Surya Ghar subsidy, 25-year savings, payback and EMI — priced on the server, every time." },
  { icon: Sparkles, title: "AI that reads the bill for you", body: "Snap a photo of the electricity bill; Claude extracts the units and consumer details. Every AI feature has a rule-based fallback if it's off." },
  { icon: KanbanSquare, title: "Explainable Hot / Warm / Cold scoring", body: "A transparent, auditable score — not a black box — with the next best action for every lead." },
  { icon: MessageCircle, title: "WhatsApp on autopilot", body: "Welcome messages, instant estimates, visit reminders, loan offers and quotation follow-ups, from an editable rules engine." },
  { icon: CalendarCheck2, title: "Conflict-free site visits", body: "Google Calendar booking with travel buffers, synced to each salesperson, with WhatsApp confirmations and reminders." },
  { icon: MapPinned, title: "GPS-verified field quotations", body: "Geofence, appointment-window and mock-GPS checks prove a quote was made at the customer's roof, on time — not from a café." },
  { icon: Hammer, title: "Installation → subsidy, tracked", body: "Booking, DISCOM feasibility, net-meter, commissioning and the PM Surya Ghar subsidy credit, with a document checklist." },
  { icon: ShieldCheck, title: "Multi-tenant by design", body: "Every table is organisation-scoped, role-based access is enforced server-side, and an audit log records every sensitive action." },
];

type Mark = true | false | "partial";
const COMPARE: { row: string; us: Mark; arka: Mark; ladder: Mark }[] = [
  { row: "Lead CRM with auto-assignment & qualification scoring", us: true, arka: "partial", ladder: true },
  { row: "GPS-verified, fraud-checked field quotations", us: true, arka: false, ladder: false },
  { row: "AI electricity-bill photo scanning", us: true, arka: false, ladder: false },
  { row: "WhatsApp automation (reminders, nudges, estimates)", us: true, arka: false, ladder: false },
  { row: "PM Surya Ghar subsidy & EMI built into every quote", us: true, arka: false, ladder: false },
  { row: "3D roof design, shading & yield simulation", us: "partial", arka: true, ladder: true },
  { row: "Installation → net-meter → subsidy project tracking", us: true, arka: false, ladder: true },
  { row: "Published self-serve pricing", us: true, arka: true, ladder: false },
];

function MarkIcon({ v }: { v: Mark }) {
  if (v === true) return <Check className="mx-auto h-4 w-4 text-emerald-500" />;
  if (v === "partial") return <span className="mx-auto block text-center text-[11px] font-medium text-amber-600">Partial</span>;
  return <Minus className="mx-auto h-4 w-4 text-slate-300" />;
}

export function MarketingHome() {
  return (
    <div className="bg-ink-950">
      <MarketingNav />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden px-5 pb-20 pt-16 sm:px-8 sm:pt-24">
          <div className="pointer-events-none absolute -right-40 -top-32 h-96 w-96 rounded-full bg-sun-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-orange-600/10 blur-3xl" />
          <div className="relative mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-sun-300">
              Built for Indian rooftop-solar EPCs · PM Surya Ghar ready
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-tight text-white sm:text-5xl">
              The sales &amp; ops OS for solar installers who are tired of spreadsheets
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-slate-400 sm:text-lg">
              Capture every lead, size every roof, send every quotation with GPS proof, and track every project to its subsidy credit — in one tool your whole team actually uses.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="sun-gradient inline-flex h-12 items-center gap-2 rounded-xl px-6 text-sm font-semibold text-white shadow-lg">
                Start free — no card required <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={`mailto:${BRAND.supportEmail}?subject=Book a demo`} className="inline-flex h-12 items-center rounded-xl border border-white/15 px-6 text-sm font-semibold text-white hover:bg-white/5">
                Book a demo
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">14-day free trial · Set up your workspace in 2 minutes</p>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-white/10 bg-ink-900/60 px-5 py-20 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-bold text-white">Everything from first enquiry to subsidy credit</h2>
              <p className="mt-3 text-slate-400">One system of record, so leads stop dying in someone's WhatsApp chat.</p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sun-500/15 text-sun-300">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-white">{f.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section id="compare" className="border-t border-white/10 px-5 py-20 sm:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <h2 className="font-display text-3xl font-bold text-white">Why not just use Arka360 or Solar Ladder?</h2>
              <p className="mx-auto mt-3 max-w-2xl text-slate-400">
                Both are solid products. Arka360 leads on 3D design and shading simulation; Solar Ladder bundles procurement and financing. {BRAND.product} is built around the two things that actually lose Indian EPCs deals and money: unverifiable field visits, and leads that go cold waiting on a callback.
              </p>
            </div>
            <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.04] text-slate-300">
                    <th className="px-4 py-3 text-left font-medium">Capability</th>
                    <th className="px-4 py-3 text-center font-medium">{BRAND.product}</th>
                    <th className="px-4 py-3 text-center font-medium">Arka360</th>
                    <th className="px-4 py-3 text-center font-medium">Solar Ladder</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((r, i) => (
                    <tr key={r.row} className={i % 2 ? "bg-white/[0.015]" : undefined}>
                      <td className="px-4 py-3 text-slate-300">{r.row}</td>
                      <td className="px-4 py-3"><MarkIcon v={r.us} /></td>
                      <td className="px-4 py-3"><MarkIcon v={r.arka} /></td>
                      <td className="px-4 py-3"><MarkIcon v={r.ladder} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
              <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Competitor features are based on their public websites as of October 2026 and may have changed — always confirm directly with the vendor. "Partial" means we offer a schematic version, not the full capability.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/10 bg-ink-900/60 px-5 py-20 text-center sm:px-8">
          <h2 className="font-display text-3xl font-bold text-white">Run your next 100 leads properly</h2>
          <p className="mx-auto mt-3 max-w-md text-slate-400">No credit card. No setup call required. Your team can be qualifying leads in minutes.</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="sun-gradient inline-flex h-12 items-center gap-2 rounded-xl px-6 text-sm font-semibold text-white shadow-lg">
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/pricing" className="inline-flex h-12 items-center rounded-xl border border-white/15 px-6 text-sm font-semibold text-white hover:bg-white/5">
              See pricing
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

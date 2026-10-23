import Link from "next/link";
import { BadgeCheck, MapPinned, MessageCircle, Sparkles, CalendarCheck2, Calculator } from "lucide-react";
import { BRAND } from "@/lib/brand";

const POINTS = [
  { icon: Calculator, title: "EB bill → system size in seconds", body: "kW, panels, PM Surya Ghar subsidy, savings and EMI — automatically." },
  { icon: Sparkles, title: "AI lead scoring & coaching", body: "Hot / Warm / Cold with the next best action for every lead." },
  { icon: MessageCircle, title: "WhatsApp on autopilot", body: "Instant replies, estimates, reminders and follow-ups." },
  { icon: CalendarCheck2, title: "Google Calendar booking", body: "Conflict-free site visits synced to every salesperson." },
  { icon: MapPinned, title: "GPS-verified quotations", body: "Proof the quote was made at the customer's roof, on time." },
];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-sun-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-orange-600/10 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10 rounded-xl" />
          <span className="font-display text-xl font-bold">{BRAND.product}</span>
        </Link>
        <div className="relative mt-auto max-w-lg">
          <h2 className="font-display text-4xl font-bold leading-tight">
            Close more rooftop solar deals, <span className="bg-gradient-to-r from-sun-300 to-orange-400 bg-clip-text text-transparent">with less chasing.</span>
          </h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sun-300">
                  <p.icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{p.title}</div>
                  <div className="text-sm text-slate-400">{p.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-12 flex items-center gap-2 text-xs text-slate-500">
          <BadgeCheck className="h-4 w-4 text-sun-400" /> Built by {BRAND.builtBy} in collaboration with {BRAND.partner}
        </div>
      </div>
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="flex items-center gap-2.5">
              <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
              <span className="font-display text-lg font-bold">{BRAND.product}</span>
            </Link>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mb-7 mt-1 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

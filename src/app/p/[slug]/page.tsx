import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseSettings } from "@/lib/settings";
import { PublicLeadForm } from "./public-form";
import { BRAND } from "@/lib/brand";
import { ShieldCheck, Landmark, Wrench, Sun } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await db.organization.findUnique({ where: { slug }, select: { name: true } });
  return { title: org ? `Rooftop solar — ${org.name}` : "Rooftop solar", description: "Get your free rooftop solar estimate with PM Surya Ghar subsidy in 30 seconds." };
}

/** Hosted lead-capture landing page with an instant solar estimate. */
export default async function PublicLanding({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ utm_campaign?: string; utm_source?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const org = await db.organization.findUnique({ where: { slug }, select: { name: true, slug: true, phone: true, logoUrl: true, settings: true } });
  if (!org) notFound();
  const s = parseSettings(org.settings);

  return (
    <main className="min-h-screen bg-gradient-to-b from-ink-950 via-ink-900 to-ink-950 text-white">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:py-14">
        <header className="mb-10 flex items-center justify-between">
          {org.logoUrl ? <img src={org.logoUrl} alt={org.name} className="h-9" /> : <span className="font-display text-lg font-bold">{org.name}</span>}
          {org.phone && (
            <a href={`tel:+${org.phone}`} className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium hover:bg-white/20">
              Call us
            </a>
          )}
        </header>
        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-sun-400/15 px-3 py-1 text-xs font-semibold text-sun-300">
              <Sun className="h-3.5 w-3.5" /> PM Surya Ghar subsidy up to ₹78,000
            </div>
            <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl">
              Cut your electricity bill by up to <span className="bg-gradient-to-r from-sun-300 to-orange-400 bg-clip-text text-transparent">90%</span> with rooftop solar.
            </h1>
            <p className="mt-4 max-w-xl text-slate-300">Enter your monthly bill to see the right system size, government subsidy, monthly savings and EMI — instantly. Our solar advisor will then plan a free site survey.</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                [ShieldCheck, "25-year performance warranty"],
                [Landmark, "Subsidy & loan paperwork handled"],
                [Wrench, "Installation in 7–15 days"],
              ].map(([Icon, t]) => {
                const I = Icon as typeof ShieldCheck;
                return (
                  <li key={t as string} className="flex items-center gap-2.5 rounded-xl bg-white/5 p-3 text-sm text-slate-200">
                    <I className="h-5 w-5 shrink-0 text-sun-300" /> {t as string}
                  </li>
                );
              })}
            </ul>
          </div>
          <PublicLeadForm slug={org.slug} orgName={org.name} settings={s} campaign={sp.utm_campaign ?? null} source={sp.utm_source ?? null} />
        </div>
        <footer className="mt-16 text-center text-xs text-slate-500">
          {org.name} · Powered by {BRAND.product}
        </footer>
      </div>
    </main>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="font-display text-lg font-bold text-white">{BRAND.product}</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 sm:flex">
          <Link href="/#features" className="hover:text-white">Features</Link>
          <Link href="/#compare" className="hover:text-white">Why not Arka360?</Link>
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-300 hover:text-white sm:inline-flex">
            Sign in
          </Link>
          <Link href="/register" className="sun-gradient inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-white shadow-sm">
            Start free trial <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink-950 px-5 py-10 text-sm text-slate-400 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="h-7 w-7 rounded-lg" />
          <span className="font-display font-semibold text-white">{BRAND.product}</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-5 text-xs">
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <Link href="/register" className="hover:text-white">Start free trial</Link>
          <Link href="/login" className="hover:text-white">Sign in</Link>
          <a href={`mailto:${BRAND.supportEmail}`} className="hover:text-white">{BRAND.supportEmail}</a>
        </div>
        <div className="text-xs text-slate-500">
          Built by{" "}
          <a href={BRAND.builtByUrl} target="_blank" rel="noopener noreferrer" className="text-slate-300 underline-offset-2 hover:text-sun-300 hover:underline">
            {BRAND.builtBy}
          </a>
        </div>
      </div>
    </footer>
  );
}

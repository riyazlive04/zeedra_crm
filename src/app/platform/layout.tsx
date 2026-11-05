import Link from "next/link";
import { Shield, ArrowLeft } from "lucide-react";
import { requirePlatformPage } from "@/lib/platform";

export const metadata = { title: "Platform console", robots: { index: false, follow: false } };

/** The platform console (super admin). Separate from any client's workspace. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformPage();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-ink-950 text-white">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <Shield className="h-5 w-5 text-sun-400" />
          <Link href="/platform" className="font-semibold">Zeedra Platform</Link>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300">Super admin</span>
          <div className="ml-auto flex items-center gap-4 text-sm text-slate-300">
            <span className="hidden sm:inline">{admin.name}</span>
            <Link href="/dashboard" className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to my workspace
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

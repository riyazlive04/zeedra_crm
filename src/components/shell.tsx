"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, Users, KanbanSquare, CalendarDays, Smartphone, FileText, MessageCircle, MapPinned, Hammer, Workflow,
  Calculator, Settings, Bell, Search, Menu, X, LogOut, CheckSquare, Plus, UserCircle2, ArrowLeft,
} from "lucide-react";
import { Avatar } from "./ui";
import { api } from "@/lib/client";
import { BRAND } from "@/lib/brand";
import { formatDistanceToNow } from "date-fns";

export interface NavPerms {
  dashboard: boolean;
  leads: boolean;
  field: boolean;
  quotations: boolean;
  whatsapp: boolean;
  tracking: boolean;
  projects: boolean;
  automations: boolean;
  settings: boolean;
  createLead: boolean;
}

const NAV: { href: string; label: string; icon: typeof Users; perm: keyof NavPerms; section?: string }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard" },
  { href: "/leads", label: "Leads", icon: Users, perm: "leads", section: "Sales" },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, perm: "leads" },
  { href: "/appointments", label: "Appointments", icon: CalendarDays, perm: "leads" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, perm: "leads" },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle, perm: "whatsapp" },
  { href: "/field", label: "Field App", icon: Smartphone, perm: "field", section: "Field" },
  { href: "/quotations", label: "Quotations", icon: FileText, perm: "quotations" },
  { href: "/tracking", label: "Field Tracking", icon: MapPinned, perm: "tracking" },
  { href: "/projects", label: "Installations", icon: Hammer, perm: "projects", section: "Delivery" },
  { href: "/automations", label: "Automations", icon: Workflow, perm: "automations", section: "Workspace" },
  { href: "/calculator", label: "Solar Calculator", icon: Calculator, perm: "leads" },
  { href: "/settings", label: "Settings", icon: Settings, perm: "settings" },
];

interface Notif {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export function AppShell({
  user,
  orgName,
  perms,
  unread: initialUnread,
  trialBanner,
  children,
}: {
  user: { name: string; email: string; role: string; avatarColor: string; roleLabel: string };
  orgName: string;
  perms: NavPerms;
  unread: number;
  trialBanner?: { tone: "ending" | "expired"; text: string } | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [q, setQ] = useState("");
  const notifRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Poll unread count every 60s so new lead / hot-lead alerts surface without reload.
  useEffect(() => {
    const t = setInterval(() => {
      api<{ unread: number }>("/api/notifications").then((r) => setUnread(r.unread)).catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  async function openNotifs() {
    setNotifOpen((o) => !o);
    const r = await api<{ items: Notif[]; unread: number }>("/api/notifications").catch(() => null);
    if (r) {
      setNotifs(r.items);
      setUnread(r.unread);
    }
  }

  async function markAllRead() {
    await api("/api/notifications", { body: {} });
    setUnread(0);
    setNotifs((n) => n?.map((x) => ({ ...x, read: true })) ?? null);
  }

  async function logout() {
    await api("/api/auth/logout", { body: {} });
    router.push("/login");
    router.refresh();
  }

  const items = NAV.filter((n) => perms[n.perm]);

  const sidebar = (
    <nav className="flex h-full flex-col bg-ink-950 text-slate-300">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5">
        <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
        <div className="leading-tight">
          <div className="font-display text-[15px] font-bold text-white">{BRAND.product}</div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Solar CRM</div>
        </div>
      </Link>
      <div className="mx-3 mb-3 truncate rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400" title={orgName}>
        {orgName}
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <div key={n.href}>
              {n.section && <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{n.section}</div>}
              <Link
                href={n.href}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition",
                  active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                )}
              >
                <n.icon className={clsx("h-4 w-4", active ? "text-sun-400" : "text-slate-500 group-hover:text-slate-300")} />
                {n.label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sun-400" />}
              </Link>
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/5 px-5 py-4 text-[10px] leading-relaxed text-slate-600">
        Built by{" "}
        <a href={BRAND.builtByUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 underline-offset-2 hover:text-sun-400 hover:underline">
          {BRAND.builtBy}
        </a>
        <br />
        in collaboration with <span className="text-slate-400">{BRAND.partner}</span>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 animate-fade-in">{sidebar}</div>
          <button className="absolute left-[268px] top-4 rounded-full bg-white p-1.5" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur sm:px-6">
          {pathname !== "/dashboard" && (
            <button className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => router.back()} aria-label="Go back">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <button className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          {perms.leads && (
            <form
              className="relative hidden max-w-md flex-1 sm:block"
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) router.push(`/leads?q=${encodeURIComponent(q.trim())}`);
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search leads by name, phone, code, area…"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-sun-500 focus:bg-white focus:ring-2 focus:ring-sun-500/20"
              />
            </form>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {perms.createLead && (
              <Link href="/leads/new" className="sun-gradient hidden h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white shadow-sm sm:inline-flex">
                <Plus className="h-4 w-4" /> New lead
              </Link>
            )}
            <div className="relative" ref={notifRef}>
              <button onClick={openNotifs} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-11 w-[22rem] max-w-[calc(100vw-2rem)] animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <span className="text-sm font-semibold">Notifications</span>
                    {unread > 0 && (
                      <button onClick={markAllRead} className="text-xs font-medium text-sun-600 hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifs === null ? (
                      <div className="p-6 text-center text-xs text-slate-400">Loading…</div>
                    ) : notifs.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">You&apos;re all caught up ☀️</div>
                    ) : (
                      notifs.map((n) => (
                        <Link
                          key={n.id}
                          href={n.href ?? "#"}
                          onClick={() => {
                            setNotifOpen(false);
                            if (!n.read) api("/api/notifications", { body: { id: n.id } }).then(() => setUnread((u) => Math.max(0, u - 1)));
                          }}
                          className={clsx("block border-b border-slate-50 px-4 py-3 hover:bg-slate-50", !n.read && "bg-sun-50/40")}
                        >
                          <div className="flex items-start gap-2">
                            {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sun-500" />}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800">{n.title}</p>
                              {n.body && <p className="truncate text-xs text-slate-500">{n.body}</p>}
                              <p className="mt-0.5 text-[11px] text-slate-400">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</p>
                            </div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100">
                <Avatar name={user.name} color={user.avatarColor} size={30} />
                <div className="hidden text-left leading-tight md:block">
                  <div className="text-xs font-semibold text-slate-800">{user.name}</div>
                  <div className="text-[11px] text-slate-500">{user.roleLabel}</div>
                </div>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-11 w-56 animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-pop">
                  <div className="border-b border-slate-100 px-4 py-2.5">
                    <div className="truncate text-sm font-medium">{user.name}</div>
                    <div className="truncate text-xs text-slate-500">{user.email}</div>
                  </div>
                  <Link href="/settings?tab=profile" className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                    <UserCircle2 className="h-4 w-4" /> My profile & calendar
                  </Link>
                  <button onClick={logout} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {trialBanner && (
          <Link
            href="/settings?tab=billing"
            className={clsx(
              "no-print flex items-center justify-center gap-2 px-4 py-2 text-center text-xs font-medium",
              trialBanner.tone === "expired" ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-amber-400 text-ink-950 hover:bg-amber-300",
            )}
          >
            {trialBanner.text}
          </Link>
        )}
        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

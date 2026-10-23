import Link from "next/link";
import clsx from "clsx";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { HELP_TOPICS, getStartContent, roleWelcomeLine, type HelpPerm } from "@/components/help/help-content";

export const metadata = { title: "Help & guide" };

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const session = await requirePageSession();
  const r = session.role;
  const visible: Record<HelpPerm, boolean> = {
    always: true,
    dashboard: r !== "INSTALLER",
    leads: r !== "INSTALLER",
    field: can(r, "quotations:create"),
    quotations: can(r, "quotations:create"),
    whatsapp: can(r, "whatsapp:send"),
    tracking: can(r, "tracking:view"),
    projects: can(r, "projects:manage"),
    automations: can(r, "automations:manage"),
    settings: can(r, "settings:manage"),
  };
  const topics = HELP_TOPICS.filter((t) => visible[t.perm]);
  const sp = await searchParams;
  const current = topics.find((t) => t.key === sp.topic) ?? topics[0];

  return (
    <div>
      <PageHeader title="Help & guide" subtitle={roleWelcomeLine(r)} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {topics.map((t, i) => (
            <div key={t.key}>
              {t.section && <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500 lg:block hidden">{t.section}</div>}
              <Link
                href={`/help?topic=${t.key}`}
                className={clsx(
                  "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition block",
                  current.key === t.key ? "bg-white text-slate-900 shadow-card ring-1 ring-slate-200" : "text-slate-600 hover:bg-white/60",
                )}
              >
                {i === 0 ? "👋 " : ""}
                {t.label}
              </Link>
            </div>
          ))}
        </nav>
        <div className="min-w-0">
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-900">{current.label}</h2>
            {current.key === "start" ? getStartContent(r) : current.body}
          </Card>
        </div>
      </div>
    </div>
  );
}

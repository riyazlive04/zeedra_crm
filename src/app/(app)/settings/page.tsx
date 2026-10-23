import Link from "next/link";
import clsx from "clsx";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { parseSettings } from "@/lib/settings";
import { aiEnabled } from "@/lib/ai";
import { googleConfigured } from "@/lib/google-calendar";
import { PageHeader } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { CompanyPanel, IntegrationsPanel, ProfilePanel, RulesPanel, TeamPanel, TemplatesPanel } from "@/components/settings/settings-panels";

export const metadata = { title: "Settings" };

const TABS = [
  ["company", "Company"],
  ["pricing", "Pricing & subsidy"],
  ["qualification", "Qualification"],
  ["field", "GPS validation"],
  ["schedule", "Scheduling"],
  ["team", "Team"],
  ["templates", "WhatsApp templates"],
  ["integrations", "Integrations"],
  ["profile", "My profile"],
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; google?: string }> }) {
  const session = await requirePageSession();
  const sp = await searchParams;
  const admin = can(session.role, "settings:manage");
  const tabs = admin ? TABS : TABS.filter(([k]) => k === "profile");
  const tab = tabs.find(([k]) => k === sp.tab)?.[0] ?? (admin ? (sp.google ? "integrations" : "company") : "profile");

  const [org, me] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: session.orgId } }),
    db.user.findUniqueOrThrow({ where: { id: session.userId }, select: { id: true, name: true, email: true, phone: true, googleEmail: true } }),
  ]);
  const settings = parseSettings(org.settings);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <div>
      <PageHeader title="Settings" subtitle={admin ? `Configure ${BRAND.product} for how your solar business sells, prices and delivers.` : "Your profile and calendar."} />
      <div className="grid gap-6 lg:grid-cols-[210px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {tabs.map(([k, l]) => (
            <Link key={k} href={`/settings?tab=${k}`} className={clsx("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition", tab === k ? "bg-white text-slate-900 shadow-card ring-1 ring-slate-200" : "text-slate-600 hover:bg-white/60")}>
              {l}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">
          {tab === "company" && <CompanyPanel org={org} />}
          {(tab === "pricing" || tab === "qualification" || tab === "field" || tab === "schedule") && <RulesPanel key={tab} settings={settings} section={tab} />}
          {tab === "team" && (
            <TeamPanel
              me={session.userId}
              users={(
                await db.user.findMany({
                  where: { organizationId: session.orgId },
                  orderBy: [{ active: "desc" }, { name: "asc" }],
                  select: { id: true, name: true, email: true, phone: true, role: true, active: true, territory: true, avatarColor: true, googleEmail: true, lastLoginAt: true },
                })
              ).map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
            />
          )}
          {tab === "templates" && <TemplatesPanel templates={await db.messageTemplate.findMany({ where: { organizationId: session.orgId }, orderBy: { name: "asc" } })} />}
          {tab === "integrations" && (
            <IntegrationsPanel
              appUrl={appUrl}
              apiKey={org.apiKey}
              orgSlug={org.slug}
              whatsapp={{ phoneNumberId: org.waPhoneNumberId, businessId: org.waBusinessId, connected: Boolean(org.waPhoneNumberId && org.waAccessToken) }}
              ai={aiEnabled()}
              googleOAuth={googleConfigured()}
              googleEmail={me.googleEmail}
              googleStatus={sp.google}
            />
          )}
          {tab === "profile" && <ProfilePanel user={me} googleOAuth={googleConfigured()} />}
        </div>
      </div>
    </div>
  );
}

import { AppShell } from "@/components/shell";
import { requirePageSession, getActiveUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, ROLE_LABEL } from "@/lib/rbac";
import { billingState } from "@/lib/billing/plans";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MODULE_KEYS, homeFor, moduleForPath } from "@/lib/modules";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  // getActiveUser is request-memoized — requirePageSession() just ran it, so this reuses
  // that result instead of issuing a second near-identical query for the same row.
  const [user, org, unread] = await Promise.all([
    getActiveUser(session.userId),
    db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { name: true, plan: true, billingStatus: true, trialEndsAt: true } }),
    db.notification.count({ where: { userId: session.userId, read: false } }),
  ]);
  // requirePageSession() already redirected away if this user weren't active, so it's here.
  if (!user) throw new Error("Active user vanished mid-request");
  const billing = session.role === "OWNER" ? billingState(org) : null;
  const modules = session.modules ?? [];
  // Block pages of modules this user can't open (menu hiding alone isn't enough).
  const path = (await headers()).get("x-pathname") ?? "";
  const mod = moduleForPath(path);
  if (mod && !modules.includes(mod)) redirect(`${homeFor(modules)}?denied=1`);
  const perms = {
    ...Object.fromEntries(MODULE_KEYS.map((k) => [k, modules.includes(k)])),
    createLead: modules.includes("leads") && can(session, "leads:edit"),
    help: true,
  };
  const trialBanner =
    billing && billing.billingStatus === "TRIALING" && billing.trialDaysLeft !== null && billing.trialDaysLeft <= 5
      ? billing.trialExpired
        ? { tone: "expired" as const, text: "Your free trial has ended. Pick a plan in Settings → Billing to keep full access." }
        : { tone: "ending" as const, text: `Your free trial ends in ${billing.trialDaysLeft} day${billing.trialDaysLeft === 1 ? "" : "s"}. Choose a plan in Settings → Billing.` }
      : billing && billing.billingStatus === "CANCELED"
        ? { tone: "expired" as const, text: "Your subscription is canceled. Pick a plan in Settings → Billing to keep full access." }
        : null;

  return (
    <AppShell user={{ ...user, roleLabel: ROLE_LABEL[user.role] }} orgName={org.name} perms={perms} unread={unread} trialBanner={trialBanner}>
      {children}
    </AppShell>
  );
}

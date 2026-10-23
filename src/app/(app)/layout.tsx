import { AppShell } from "@/components/shell";
import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, ROLE_LABEL } from "@/lib/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  const [user, org, unread] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: session.userId }, select: { name: true, email: true, role: true, avatarColor: true } }),
    db.organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { name: true } }),
    db.notification.count({ where: { userId: session.userId, read: false } }),
  ]);
  const r = session.role;
  const perms = {
    dashboard: r !== "INSTALLER",
    leads: r !== "INSTALLER",
    field: can(r, "quotations:create"),
    quotations: can(r, "quotations:create"),
    whatsapp: can(r, "whatsapp:send"),
    tracking: can(r, "tracking:view"),
    projects: can(r, "projects:manage"),
    automations: can(r, "automations:manage"),
    settings: can(r, "settings:manage"),
    createLead: can(r, "leads:edit"),
  };
  return (
    <AppShell user={{ ...user, roleLabel: ROLE_LABEL[user.role] }} orgName={org.name} perms={perms} unread={unread}>
      {children}
    </AppShell>
  );
}

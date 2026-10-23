import { requirePageSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { orgSettings } from "@/lib/api";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { NewLeadForm } from "@/components/leads/new-lead-form";

export const metadata = { title: "New lead" };

export default async function NewLeadPage() {
  const session = await requirePageSession("leads:edit");
  const [settings, users] = await Promise.all([
    orgSettings(session.orgId),
    db.user.findMany({
      where: { organizationId: session.orgId, active: true, role: { in: ["TELECALLER", "FIELD_SALES", "SALES_MANAGER"] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <div>
      <PageHeader title="New lead" subtitle="Capture the enquiry — qualification, sizing and the WhatsApp welcome happen automatically." />
      <NewLeadForm settings={settings} users={users} canAssign={can(session.role, "leads:assign")} />
    </div>
  );
}

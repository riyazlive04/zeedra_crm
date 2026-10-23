import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { getLeadForSession } from "@/lib/services/leads";

export const GET = route<{ id: string }>(null, async ({ session, params }) => {
  const lead = await getLeadForSession(session, params.id);
  return db.whatsAppMessage.findMany({
    where: { organizationId: session.orgId, leadId: lead.id },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
});

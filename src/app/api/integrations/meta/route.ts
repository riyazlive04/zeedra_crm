import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { audit } from "@/lib/activity";
import { connectMetaPage, disconnectMetaPage, syncMetaLeads } from "@/lib/services/meta-leads";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), pageId: z.string().trim().min(1).max(40), accessToken: z.string().trim().min(20).max(1000) }),
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("disconnect") }),
]);

/** Settings → Integrations → Facebook & Instagram Lead Ads. */
export const POST = route("settings:manage", async ({ req, session }) => {
  const body = await parseBody(req, schema);
  if (body.action === "connect") {
    const r = await connectMetaPage(session.orgId, body.pageId, body.accessToken);
    await audit({ orgId: session.orgId, userId: session.userId, action: "connect", entity: "meta-leads", meta: { pageId: r.pageId } });
    return { ...r, sync: await syncMetaLeads(session.orgId) };
  }
  if (body.action === "sync") return syncMetaLeads(session.orgId);
  await disconnectMetaPage(session.orgId);
  await audit({ orgId: session.orgId, userId: session.userId, action: "disconnect", entity: "meta-leads" });
  return { ok: true };
});

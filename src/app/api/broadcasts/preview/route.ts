import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { audienceWhere } from "@/lib/nurture/engine";
import { audienceSchema } from "@/lib/nurture/schema";

/** How many opted-in leads an audience reaches, plus a few names to sanity-check. */
export const POST = route(null, async ({ req, session }) => {
  const audience = await parseBody(req, audienceSchema);
  const where = audienceWhere(session.orgId, audience);
  const [count, optedOut, sample] = await Promise.all([
    db.lead.count({ where }),
    db.lead.count({ where: { ...where, whatsappOptIn: false } }),
    db.lead.findMany({ where, select: { name: true, code: true }, take: 5, orderBy: { createdAt: "desc" } }),
  ]);
  return { count, optedOut, sample };
});

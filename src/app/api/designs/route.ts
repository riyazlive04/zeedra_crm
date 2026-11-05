import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { getLeadForSession } from "@/lib/services/leads";
import { emptyDesign } from "@/lib/solar/shading";

/** Roof designs for the org, newest first. */
export const GET = route(null, async ({ session }) =>
  db.solarDesign.findMany({
    where: { organizationId: session.orgId },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, name: true, lat: true, lng: true, panelCount: true, systemKw: true, shadingLossPct: true, annualKwh: true, updatedAt: true, lead: { select: { id: true, name: true, code: true } } },
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  leadId: z.string().optional().nullable(),
});

export const POST = route("leads:edit", async ({ req, session }) => {
  const input = await parseBody(req, createSchema);
  if (input.leadId) await getLeadForSession(session, input.leadId);
  const data = emptyDesign({ lat: input.lat, lng: input.lng });
  return db.solarDesign.create({
    data: { organizationId: session.orgId, leadId: input.leadId || null, name: input.name, lat: input.lat, lng: input.lng, data: data as object, createdById: session.userId },
    select: { id: true },
  });
});

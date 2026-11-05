import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";

type P = { id: string };

async function getDesign(orgId: string, id: string) {
  const d = await db.solarDesign.findFirst({ where: { id, organizationId: orgId } });
  if (!d) throw new ApiError(404, "Design not found");
  return d;
}

export const GET = route<P>(null, async ({ session, params }) => getDesign(session.orgId, params.id));

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  data: z.record(z.unknown()).optional(),
  panelCount: z.number().int().min(0).max(100000).optional(),
  systemKw: z.number().min(0).max(100000).optional(),
  shadingLossPct: z.number().min(0).max(100).nullable().optional(),
  annualKwh: z.number().min(0).nullable().optional(),
});

export const PATCH = route<P>("leads:edit", async ({ req, session, params }) => {
  await getDesign(session.orgId, params.id);
  const input = await parseBody(req, patchSchema);
  // Drone overlays are stored inline as downscaled JPEG data URLs; keep a design under ~6 MB.
  if (input.data && JSON.stringify(input.data).length > 6_000_000) throw new ApiError(413, "Design is too large — use a smaller drone image");
  const center = (input.data?.center ?? null) as { lat?: number; lng?: number } | null;
  const updated = await db.solarDesign.update({
    where: { id: params.id },
    data: {
      ...input,
      data: input.data as object | undefined,
      ...(center && typeof center.lat === "number" && typeof center.lng === "number" ? { lat: center.lat, lng: center.lng } : {}),
    },
    select: { id: true, updatedAt: true },
  });
  return updated;
});

export const DELETE = route<P>("leads:edit", async ({ session, params }) => {
  await getDesign(session.orgId, params.id);
  await db.solarDesign.delete({ where: { id: params.id } });
  return { ok: true };
});

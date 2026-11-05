import crypto from "node:crypto";
import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";

type P = { id: string };

/** Create (or return) the customer preview link. DELETE revokes it. */
export const POST = route<P>("leads:edit", async ({ session, params }) => {
  const d = await db.solarDesign.findFirst({ where: { id: params.id, organizationId: session.orgId }, select: { id: true, shareToken: true } });
  if (!d) throw new ApiError(404, "Design not found");
  const shareToken = d.shareToken ?? crypto.randomBytes(18).toString("base64url");
  if (!d.shareToken) await db.solarDesign.update({ where: { id: d.id }, data: { shareToken } });
  return { shareToken, url: `/d/${shareToken}` };
});

export const DELETE = route<P>("leads:edit", async ({ session, params }) => {
  const d = await db.solarDesign.findFirst({ where: { id: params.id, organizationId: session.orgId }, select: { id: true } });
  if (!d) throw new ApiError(404, "Design not found");
  await db.solarDesign.update({ where: { id: d.id }, data: { shareToken: null } });
  return { ok: true };
});

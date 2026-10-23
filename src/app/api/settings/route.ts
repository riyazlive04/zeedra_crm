import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { orgSettingsSchema, parseSettings } from "@/lib/settings";
import { generateApiKey } from "@/lib/services/tenant";
import { audit } from "@/lib/activity";
import { aiEnabled } from "@/lib/ai";
import { googleConfigured } from "@/lib/google-calendar";

export const GET = route("settings:manage", async ({ session }) => {
  const org = await db.organization.findUniqueOrThrow({ where: { id: session.orgId } });
  return {
    org: { name: org.name, slug: org.slug, phone: org.phone, email: org.email, address: org.address, gstin: org.gstin, logoUrl: org.logoUrl, plan: org.plan },
    settings: parseSettings(org.settings),
    apiKey: org.apiKey,
    whatsapp: { phoneNumberId: org.waPhoneNumberId, businessId: org.waBusinessId, connected: Boolean(org.waPhoneNumberId && org.waAccessToken) },
    integrations: { ai: aiEnabled(), googleOAuth: googleConfigured() },
  };
});

const schema = z.object({
  org: z
    .object({
      name: z.string().trim().min(2).max(120),
      phone: z.string().trim().max(20).nullable(),
      email: z.string().trim().email().nullable().or(z.literal("").transform(() => null)),
      address: z.string().trim().max(300).nullable(),
      gstin: z.string().trim().max(20).nullable(),
      logoUrl: z.string().trim().url().nullable().or(z.literal("").transform(() => null)),
    })
    .partial()
    .optional(),
  settings: orgSettingsSchema.partial().optional(),
  whatsapp: z.object({ phoneNumberId: z.string().trim().max(40).nullable(), accessToken: z.string().trim().max(600).optional(), businessId: z.string().trim().max(40).nullable() }).optional(),
  rotateApiKey: z.boolean().optional(),
});

export const PATCH = route("settings:manage", async ({ req, session }) => {
  const body = await parseBody(req, schema);
  const org = await db.organization.findUniqueOrThrow({ where: { id: session.orgId } });
  const data: Prisma.OrganizationUpdateInput = { ...(body.org ?? {}) };
  if (body.settings) data.settings = { ...parseSettings(org.settings), ...body.settings } as unknown as Prisma.InputJsonValue;
  if (body.whatsapp) {
    data.waPhoneNumberId = body.whatsapp.phoneNumberId || null;
    data.waBusinessId = body.whatsapp.businessId || null;
    // Empty token field = keep existing token (it is never sent back to the browser).
    if (body.whatsapp.accessToken) data.waAccessToken = body.whatsapp.accessToken;
    if (!body.whatsapp.phoneNumberId) data.waAccessToken = null;
  }
  if (body.rotateApiKey) data.apiKey = generateApiKey();
  await db.organization.update({ where: { id: org.id }, data });
  await audit({ orgId: org.id, userId: session.userId, action: "update", entity: "settings", meta: { sections: Object.keys(body) } });
  return { ok: true };
});

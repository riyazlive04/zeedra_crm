import crypto from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_RULES, DEFAULT_TEMPLATES } from "../defaults";
import { DEFAULT_SETTINGS, type OrgSettings } from "../settings";
import { TRIAL_DAYS } from "../billing/plans";

export function generateApiKey() {
  return `sf_live_${crypto.randomBytes(24).toString("base64url")}`;
}

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org"
  );
}

/** Creates a tenant with its owner, default WhatsApp templates and automation playbook. */
export async function provisionOrganization(
  db: PrismaClient,
  input: { orgName: string; ownerName: string; email: string; phone?: string | null; password: string; settings?: Partial<OrgSettings> },
) {
  let slug = slugify(input.orgName);
  if (await db.organization.findUnique({ where: { slug } })) slug = `${slug}-${crypto.randomBytes(2).toString("hex")}`;

  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.orgName,
        slug,
        phone: input.phone ?? null,
        email: input.email,
        apiKey: generateApiKey(),
        settings: { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) } as unknown as Prisma.InputJsonValue,
        billingStatus: "TRIALING",
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      },
    });
    const owner = await tx.user.create({
      data: {
        organizationId: org.id,
        name: input.ownerName,
        email: input.email.toLowerCase(),
        phone: input.phone ?? null,
        passwordHash: await bcrypt.hash(input.password, 11),
        role: "OWNER",
        avatarColor: "#f59e0b",
      },
    });
    await tx.messageTemplate.createMany({
      data: DEFAULT_TEMPLATES.map((t) => ({ ...t, organizationId: org.id })),
    });
    for (const r of DEFAULT_RULES) {
      await tx.automationRule.create({
        data: {
          organizationId: org.id,
          name: r.name,
          description: r.description,
          trigger: r.trigger,
          conditions: r.conditions as unknown as Prisma.InputJsonValue,
          actions: r.actions as unknown as Prisma.InputJsonValue,
          delayMinutes: r.delayMinutes ?? 0,
          active: r.active ?? true,
        },
      });
    }
    return { org, owner };
  });
}

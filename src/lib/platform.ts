import "server-only";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getSession } from "./auth";
import { ApiError } from "./errors";

/**
 * Platform (super) admins: the people who run Zeedra itself and onboard client companies.
 * Set PLATFORM_ADMIN_EMAILS to a comma-separated list, e.g. "riyaz@sirahdigital.in,faiz@sirahdigital.in".
 * They sign in with their normal accounts; the console lives at /platform.
 */
export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export interface PlatformAdmin {
  userId: string;
  orgId: string;
  name: string;
  email: string;
}

/** The signed-in platform admin, or null. A "View as" session never counts as admin. */
export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  const s = await getSession();
  if (!s || s.imp) return null;
  const allowed = platformAdminEmails();
  if (!allowed.length) return null;
  // Check the real email from the database, not just the token.
  const u = await db.user.findUnique({ where: { id: s.userId }, select: { id: true, organizationId: true, name: true, email: true, active: true } });
  if (!u?.active || !allowed.includes(u.email.toLowerCase())) return null;
  return { userId: u.id, orgId: u.organizationId, name: u.name, email: u.email };
}

export async function requirePlatformPage(): Promise<PlatformAdmin> {
  const a = await getPlatformAdmin();
  if (!a) redirect("/dashboard?denied=1");
  return a;
}

export async function requirePlatformApi(): Promise<PlatformAdmin> {
  const a = await getPlatformAdmin();
  if (!a) throw new ApiError(403, "Platform admins only");
  return a;
}

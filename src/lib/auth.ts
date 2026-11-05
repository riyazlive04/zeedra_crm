import "server-only";
import { effectiveModules, effectivePermissions, homeFor } from "./modules";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession, type Session } from "./session";
import { can, type Permission } from "./rbac";
import { ApiError } from "./errors";

export type { Session };

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function createSessionCookie(s: Session) {
  const token = await signSession(s);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

// A page's layout and the page itself each call requirePageSession() in the same request —
// cache() dedupes that into a single DB round trip per request instead of one per call site.
// Selects every field any caller (layout included) needs, so the shell can reuse this instead
// of running its own near-duplicate user query.
export const getActiveUser = cache((userId: string) =>
  db.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true, name: true, email: true, avatarColor: true, organizationId: true, modules: true, customRole: { select: { name: true, modules: true } } },
  }),
);

/** For server components/pages: redirect to login when signed out, re-checks the user is still active. */
export async function requirePageSession(permission?: Permission): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  const user = await getActiveUser(s.userId);
  if (!user?.active) redirect("/login?error=inactive");
  // Role and name come from the DB so profile edits and role changes apply without re-login.
  const modules = effectiveModules(user.role, user.modules, user.customRole?.modules);
  const session: Session = { ...s, role: user.role, name: user.name, modules, perms: effectivePermissions(user.role, modules) };
  if (permission && !can(session, permission)) redirect(`${homeFor(modules)}?denied=1`);
  return session;
}

/** For API routes. Role is re-read from DB so revocations apply immediately. */
export async function requireApiSession(permission?: Permission): Promise<Session> {
  const s = await getSession();
  if (!s) throw new ApiError(401, "Not signed in");
  const user = await getActiveUser(s.userId);
  if (!user?.active || user.organizationId !== s.orgId) throw new ApiError(401, "Session no longer valid");
  const modules = effectiveModules(user.role, user.modules, user.customRole?.modules);
  const session: Session = { ...s, role: user.role, name: user.name, modules, perms: effectivePermissions(user.role, modules) };
  if (permission && !can(session, permission)) throw new ApiError(403, "You don't have access to this. Ask your admin to enable the module for you.");
  return session;
}

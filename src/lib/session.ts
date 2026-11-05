// Edge-safe session primitives (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sf_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type RoleName = "OWNER" | "ADMIN" | "SALES_MANAGER" | "TELECALLER" | "FIELD_SALES" | "INSTALLER";

export interface Session {
  userId: string;
  orgId: string;
  role: RoleName;
  name: string;
  email: string;
  /** Effective module keys and permissions (from the DB, per request). */
  modules?: string[];
  /** Set while a platform admin is viewing the app as this user ("View as" support). */
  imp?: { adminId: string; adminName: string };
  perms?: import("./rbac").Permission[];
}

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (32+ chars) in production");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-please-0000");
  }
  return new TextEncoder().encode(s);
}

/** Support ("View as") sessions are short-lived. */
export const IMPERSONATION_TTL_SECONDS = 2 * 60 * 60;

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ org: s.orgId, role: s.role, name: s.name, email: s.email, ...(s.imp ? { imp: s.imp } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${s.imp ? IMPERSONATION_TTL_SECONDS : SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.org !== "string") return null;
    return {
      userId: payload.sub,
      orgId: payload.org,
      role: payload.role as RoleName,
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      ...(payload.imp && typeof payload.imp === "object" ? { imp: payload.imp as { adminId: string; adminName: string } } : {}),
    };
  } catch {
    return null;
  }
}

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
}

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (32+ chars) in production");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-please-0000");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ org: s.orgId, role: s.role, name: s.name, email: s.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
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
    };
  } catch {
    return null;
  }
}

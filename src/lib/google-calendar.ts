import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";

/**
 * Google Calendar sync via OAuth 2.0 (per salesperson). Uses the REST API directly
 * to avoid the heavy googleapis dependency.
 */

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

const redirectUri = () => `${process.env.APP_URL ?? "http://localhost:3000"}/api/integrations/google/callback`;
const stateKey = () => new TextEncoder().encode(`${process.env.AUTH_SECRET ?? "dev"}:google-oauth`);

export async function googleAuthUrl(userId: string): Promise<string> {
  const state = await new SignJWT({ uid: userId }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(stateKey());
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function verifyGoogleState(state: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(state, stateKey());
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string): Promise<{ refreshToken?: string; email?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as { refresh_token?: string; id_token?: string; error_description?: string };
  if (!res.ok) throw new Error(json.error_description ?? "Google token exchange failed");
  let email: string | undefined;
  if (json.id_token) {
    // id_token came straight from Google's token endpoint over TLS, so reading its claims is safe.
    const claims = JSON.parse(Buffer.from(json.id_token.split(".")[1], "base64url").toString()) as { email?: string };
    email = claims.email;
  }
  return { refreshToken: json.refresh_token, email };
}

async function accessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error === "invalid_grant" ? "Google access revoked — reconnect calendar" : "Google auth failed");
  return json.access_token;
}

async function gcal(userId: string, path: string, init: RequestInit = {}) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { googleRefreshToken: true, googleCalendarId: true } });
  if (!user?.googleRefreshToken || !googleConfigured()) return null;
  const token = await accessToken(user.googleRefreshToken);
  const cal = encodeURIComponent(user.googleCalendarId || "primary");
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path.replace("{cal}", cal)}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 204) return {};
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: { message?: string } }).error?.message ?? `Google Calendar HTTP ${res.status}`);
  return json as Record<string, unknown>;
}

export interface CalendarEventInput {
  summary: string;
  description: string;
  location?: string | null;
  start: Date;
  end: Date;
  attendeeEmail?: string | null;
  timezone: string;
}

function eventBody(e: CalendarEventInput) {
  return {
    summary: e.summary,
    description: e.description,
    location: e.location ?? undefined,
    start: { dateTime: e.start.toISOString(), timeZone: e.timezone },
    end: { dateTime: e.end.toISOString(), timeZone: e.timezone },
    attendees: e.attendeeEmail ? [{ email: e.attendeeEmail }] : undefined,
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }, { method: "popup", minutes: 15 }] },
  };
}

/** Returns the Google event id, or null if the user has not connected Google Calendar. */
export async function createCalendarEvent(userId: string, e: CalendarEventInput): Promise<string | null> {
  const out = await gcal(userId, "/calendars/{cal}/events?sendUpdates=all", { method: "POST", body: JSON.stringify(eventBody(e)) });
  return (out?.id as string | undefined) ?? null;
}

export async function updateCalendarEvent(userId: string, eventId: string, e: CalendarEventInput) {
  await gcal(userId, `/calendars/{cal}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: "PATCH",
    body: JSON.stringify(eventBody(e)),
  });
}

export async function deleteCalendarEvent(userId: string, eventId: string) {
  await gcal(userId, `/calendars/{cal}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE" });
}

/** Busy intervals from Google for the user's calendar (empty if not connected). */
export async function googleBusy(userId: string, from: Date, to: Date): Promise<{ start: Date; end: Date }[]> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { googleCalendarId: true } });
  const calId = user?.googleCalendarId || "primary";
  const out = await gcal(userId, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: calId }] }),
  }).catch(() => null);
  const cals = (out?.calendars ?? {}) as Record<string, { busy?: { start: string; end: string }[] }>;
  return (cals[calId]?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

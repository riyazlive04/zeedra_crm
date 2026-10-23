import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError } from "./errors";
import { requireApiSession, type Session } from "./auth";
import type { Permission } from "./rbac";
import { db } from "./db";
import { parseSettings, type OrgSettings } from "./settings";

export interface Ctx<P> {
  req: NextRequest;
  session: Session;
  params: P;
}

type RouteContext<P> = { params: Promise<P> };

/** Wraps an authenticated route handler with uniform error handling and permission checks. */
export function route<P = Record<string, string>>(
  permission: Permission | null,
  fn: (ctx: Ctx<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, context: RouteContext<P>) => {
    try {
      const session = await requireApiSession(permission ?? undefined);
      const params = (await context?.params) ?? ({} as P);
      const out = await fn({ req, session, params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  if (e instanceof ZodError)
    return NextResponse.json(
      { error: "Validation failed", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return NextResponse.json({ error: "A record with these details already exists" }, { status: 409 });
    if (e.code === "P2025") return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }
  console.error("[api] unhandled", e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
  return schema.parse(json);
}

/** Parses multipart/form-data, turning malformed uploads into a 400 instead of a 500. */
export async function readForm(req: Request): Promise<FormData> {
  try {
    return await req.formData();
  } catch {
    throw new ApiError(400, "Expected a multipart/form-data upload");
  }
}

export function searchParams(req: NextRequest) {
  return req.nextUrl.searchParams;
}

export async function orgSettings(orgId: string): Promise<OrgSettings> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { settings: true } });
  return parseSettings(org.settings);
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

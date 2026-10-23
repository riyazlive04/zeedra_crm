import type { Prisma } from "@prisma/client";
import { route, parseBody, searchParams } from "@/lib/api";
import { db } from "@/lib/db";
import { createQuotation, quotationInputSchema } from "@/lib/services/field";
import { can } from "@/lib/rbac";

export const GET = route(null, async ({ req, session }) => {
  const q = searchParams(req);
  const where: Prisma.QuotationWhereInput = { organizationId: session.orgId };
  if (!can(session.role, "quotations:review")) where.createdById = session.userId;
  else if (q.get("userId")) where.createdById = q.get("userId")!;
  if (q.get("verdict")) where.geoVerdict = q.get("verdict") as Prisma.QuotationWhereInput["geoVerdict"];
  if (q.get("flagged") === "1") where.geoVerdict = { notIn: ["VERIFIED", "OFFICE_CREATED"] };
  if (q.get("status")) where.status = q.get("status") as Prisma.QuotationWhereInput["status"];
  if (q.get("leadId")) where.leadId = q.get("leadId")!;
  return db.quotation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      lead: { select: { id: true, name: true, code: true, city: true, lat: true, lng: true, sitePinned: true } },
      createdBy: { select: { id: true, name: true, avatarColor: true } },
    },
  });
});

export const POST = route("quotations:create", async ({ req, session }) => {
  const input = await parseBody(req, quotationInputSchema);
  const ua = req.headers.get("user-agent") ?? "";
  const result = await createQuotation(session, { ...input, deviceInfo: input.deviceInfo ?? ua.slice(0, 300) });
  return Response.json(result, { status: 201 });
});

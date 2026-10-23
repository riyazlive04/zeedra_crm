import type { Prisma } from "@prisma/client";
import { route, parseBody, searchParams } from "@/lib/api";
import { db } from "@/lib/db";
import { leadCreateSchema } from "@/lib/validators";
import { createLead, leadListWhere } from "@/lib/services/leads";
import { can } from "@/lib/rbac";

export const GET = route(null, async ({ req, session }) => {
  const q = searchParams(req);
  const page = Math.max(1, Number(q.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(q.get("pageSize") ?? 25) || 25));
  const where = leadListWhere(q, session);
  const sort = q.get("sort") ?? "recent";
  const orderBy: Prisma.LeadOrderByWithRelationInput[] =
    sort === "score"
      ? [{ score: "desc" }]
      : sort === "followup"
        ? [{ nextFollowUpAt: "asc" }]
        : sort === "bill"
          ? [{ monthlyBill: "desc" }]
          : [{ createdAt: "desc" }];

  const [total, items] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, code: true, name: true, phone: true, city: true, source: true, segment: true, stage: true, temperature: true,
        score: true, monthlyBill: true, recommendedKw: true, nextFollowUpAt: true, createdAt: true, basicQualified: true,
        assignedTo: { select: { id: true, name: true, avatarColor: true } },
      },
    }),
  ]);
  return { total, page, pageSize, items };
});

export const POST = route("leads:edit", async ({ req, session }) => {
  const input = await parseBody(req, leadCreateSchema);
  if (input.assignedToId && !can(session.role, "leads:assign")) input.assignedToId = session.userId;
  if (!input.assignedToId && session.role === "FIELD_SALES") input.assignedToId = session.userId;
  const { lead, duplicate } = await createLead(session.orgId, input, session.userId);
  return Response.json({ lead, duplicate }, { status: duplicate ? 200 : 201 });
});

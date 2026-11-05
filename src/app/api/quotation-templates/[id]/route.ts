import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { sanitizeTemplate } from "@/lib/quote-template";

type P = { id: string };

async function own(orgId: string, id: string) {
  const t = await db.quotationTemplate.findFirst({ where: { id, organizationId: orgId }, select: { id: true } });
  if (!t) throw new ApiError(404, "Template not found");
  return t;
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  html: z.string().min(20).max(2_000_000).optional(),
  active: z.boolean().optional(),
});

/** Rename, edit the HTML, or switch it on (only one template is on at a time). */
export const PATCH = route<P>("settings:manage", async ({ req, session, params }) => {
  const t = await own(session.orgId, params.id);
  const input = await parseBody(req, patchSchema);
  return db.$transaction(async (tx) => {
    if (input.active) await tx.quotationTemplate.updateMany({ where: { organizationId: session.orgId, active: true, NOT: { id: t.id } }, data: { active: false } });
    return tx.quotationTemplate.update({
      where: { id: t.id },
      data: { name: input.name, active: input.active, html: input.html !== undefined ? sanitizeTemplate(input.html) : undefined },
      select: { id: true, name: true, active: true, sourceFileName: true, html: true, updatedAt: true },
    });
  });
});

/** Quotations already made with it go back to the built-in design. */
export const DELETE = route<P>("settings:manage", async ({ session, params }) => {
  const t = await own(session.orgId, params.id);
  await db.quotationTemplate.delete({ where: { id: t.id } });
  return { ok: true };
});

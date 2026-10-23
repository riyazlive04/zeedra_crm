import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { templateSchema } from "./schema";

export const GET = route(null, async ({ session }) =>
  db.messageTemplate.findMany({ where: { organizationId: session.orgId }, orderBy: { name: "asc" } }),
);

export const POST = route("templates:manage", async ({ req, session }) => {
  const body = await parseBody(req, templateSchema);
  if (await db.messageTemplate.findUnique({ where: { organizationId_key: { organizationId: session.orgId, key: body.key } } }))
    throw new ApiError(409, "A template with this key already exists");
  return db.messageTemplate.create({ data: { ...body, organizationId: session.orgId } });
});

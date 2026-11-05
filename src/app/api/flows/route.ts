import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { route, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { blankFlow, DEFAULT_SETTINGS, FLOW_RECIPES } from "@/lib/nurture/types";

/** Flows with run counts for the list page. */
export const GET = route(null, async ({ session }) => {
  const flows = await db.flow.findMany({ where: { organizationId: session.orgId }, orderBy: { updatedAt: "desc" } });
  const counts = await db.flowRun.groupBy({ by: ["flowId", "status"], where: { organizationId: session.orgId }, _count: true });
  return flows.map((f) => {
    const c = (s: string) => counts.find((x) => x.flowId === f.id && x.status === s)?._count ?? 0;
    return { ...f, stats: { active: c("ACTIVE") + c("WAITING_REPLY"), completed: c("COMPLETED"), stopped: c("STOPPED"), failed: c("FAILED") } };
  });
});

const createSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), recipe: z.string().optional() });

export const POST = route("automations:manage", async ({ req, session }) => {
  const input = await parseBody(req, createSchema);
  const recipe = input.recipe ? FLOW_RECIPES.find((r) => r.key === input.recipe) : null;
  if (input.recipe && !recipe) throw new ApiError(400, "Unknown recipe");
  return db.flow.create({
    data: {
      organizationId: session.orgId,
      name: input.name || recipe?.name || "Untitled flow",
      description: recipe?.description ?? null,
      graph: (recipe ? recipe.build() : blankFlow()) as unknown as Prisma.InputJsonValue,
      settings: DEFAULT_SETTINGS as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
});

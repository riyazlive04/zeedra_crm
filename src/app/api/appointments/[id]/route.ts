import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { updateAppointment } from "@/lib/services/appointments";
import { checkIn, checkOut, captureSchema } from "@/lib/services/field";
import { APPT_TYPES } from "@/lib/validators";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    status: z.enum(["CANCELLED", "NO_SHOW", "SCHEDULED"]).optional(),
    startAt: z.coerce.date().optional(),
    durationMinutes: z.number().int().min(15).max(480).optional(),
    notes: z.string().max(2000).nullable().optional(),
    assignedToId: z.string().optional(),
    type: z.enum(APPT_TYPES).optional(),
  }),
  z.object({ action: z.literal("checkIn"), capture: captureSchema }),
  z.object({ action: z.literal("checkOut"), outcome: z.string().max(2000).nullable().optional() }),
]);

export const POST = route<{ id: string }>("appointments:manage", async ({ req, session, params }) => {
  const body = await parseBody(req, schema);
  switch (body.action) {
    case "update": {
      const { action: _a, ...patch } = body;
      void _a;
      return updateAppointment(session, params.id, patch);
    }
    case "checkIn":
      return checkIn(session, params.id, body.capture);
    case "checkOut":
      return checkOut(session, params.id, body.outcome ?? null);
  }
});

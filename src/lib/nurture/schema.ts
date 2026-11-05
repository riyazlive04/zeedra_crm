import { z } from "zod";

export const audienceSchema = z.object({
  stage: z.array(z.string()).optional(),
  temperature: z.array(z.string()).optional(),
  segment: z.array(z.string()).optional(),
  source: z.array(z.string()).optional(),
  city: z.string().max(80).optional(),
  minBill: z.number().min(0).nullable().optional(),
});

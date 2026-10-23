import { z } from "zod";

export const templateSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{2,40}$/, "Use lowercase letters, digits and underscores"),
  name: z.string().trim().min(2).max(80),
  category: z.enum(["UTILITY", "MARKETING"]),
  metaTemplateName: z.string().trim().max(80).nullable().optional(),
  language: z.string().trim().min(2).max(10).default("en"),
  body: z.string().trim().min(5).max(1024),
  active: z.boolean().default(true),
});

import { z } from "zod";
import { CONDITION_FIELDS, TRIGGERS } from "@/lib/automation/types";

const triggerKeys = Object.keys(TRIGGERS) as [keyof typeof TRIGGERS, ...(keyof typeof TRIGGERS)[]];
const fieldKeys = Object.keys(CONDITION_FIELDS) as [keyof typeof CONDITION_FIELDS, ...(keyof typeof CONDITION_FIELDS)[]];

export const conditionSchema = z.object({
  field: z.enum(fieldKeys),
  op: z.enum(["eq", "neq", "gte", "lte", "in"]),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SEND_WHATSAPP"), templateKey: z.string().min(1) }),
  z.object({ type: z.literal("CREATE_TASK"), title: z.string().min(2).max(120), dueInHours: z.number().min(0).max(720), priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional() }),
  z.object({ type: z.literal("NOTIFY_ASSIGNEE"), title: z.string().min(2).max(120) }),
  z.object({ type: z.literal("NOTIFY_MANAGERS"), title: z.string().min(2).max(120) }),
  z.object({ type: z.literal("SET_FOLLOW_UP"), inHours: z.number().min(0).max(2160) }),
]);

export const ruleSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().max(300).nullable().optional(),
  trigger: z.enum(triggerKeys),
  conditions: z.array(conditionSchema).max(10).default([]),
  actions: z.array(actionSchema).min(1, "Add at least one action").max(10),
  delayMinutes: z.number().int().min(0).max(43200).default(0),
  active: z.boolean().default(true),
});

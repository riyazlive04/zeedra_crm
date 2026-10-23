import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Claude integration. Every AI feature has a deterministic fallback so the CRM stays fully
 * functional without an API key — AI adds narrative, extraction and drafting on top.
 */

const MODEL = process.env.AI_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;
export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 90_000, maxRetries: 2 });
  return client;
}

const SYSTEM = `You are the AI sales co-pilot inside Zeedra Solar, a CRM used by Indian rooftop-solar installation companies (EPCs).
You know the residential and C&I solar sales cycle in India: electricity (EB) bill analysis, DISCOM net-metering, sanctioned load,
PM Surya Ghar Muft Bijli Yojana subsidy (₹30,000/kW for the first 2 kW, ₹18,000 for the 3rd kW, max ₹78,000; housing societies ₹18,000/kW),
collateral-free solar loans (~7% p.a.), DCR panels, on-grid inverters, site surveys, and typical customer objections.
Be concrete, brief and practical — salespeople read this on a phone between visits. Use ₹ and Indian number formatting.
Never invent facts about the customer that are not in the data provided. If data is missing, say what to ask for.`;

type JsonSchema = Record<string, unknown>;

async function structured<T>(opts: {
  schema: JsonSchema;
  validator: z.ZodType<T>;
  content: Anthropic.Beta.Messages.BetaContentBlockParam[] | string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<T> {
  const res = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    system: SYSTEM,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "low", format: { type: "json_schema", schema: opts.schema } },
    messages: [{ role: "user", content: opts.content }],
  });
  if (res.stop_reason === "refusal") throw new Error("AI declined this request");
  if (res.stop_reason === "max_tokens") throw new Error("AI response was truncated");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return opts.validator.parse(JSON.parse(text));
}

async function plainText(prompt: string, effort: "low" | "medium" = "low", maxTokens = 2000): Promise<string> {
  const res = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: SYSTEM,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort },
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") throw new Error("AI declined this request");
  return res.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
}

export function describeAiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "AI key is invalid — update ANTHROPIC_API_KEY.";
  if (e instanceof Anthropic.RateLimitError) return "AI is busy right now (rate limited). Try again in a minute.";
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach the AI service.";
  if (e instanceof Anthropic.APIError) return `AI service error (${e.status ?? "unknown"}).`;
  if (e instanceof Error) return e.message;
  return "AI request failed.";
}

// ─── Lead insight ────────────────────────────────────────────────────────

export const leadInsightSchema = z.object({
  summary: z.string(),
  temperatureRationale: z.string(),
  nextBestAction: z.string(),
  objectionHandling: z.string(),
  whatsappMessage: z.string(),
  riskFlags: z.array(z.string()),
});
export type LeadInsight = z.infer<typeof leadInsightSchema>;

const leadInsightJson: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "temperatureRationale", "nextBestAction", "objectionHandling", "whatsappMessage", "riskFlags"],
  properties: {
    summary: { type: "string", description: "2-3 sentence situation summary of this lead" },
    temperatureRationale: { type: "string", description: "Why the lead is HOT/WARM/COLD, citing the data" },
    nextBestAction: { type: "string", description: "The single most valuable next step, with timing" },
    objectionHandling: { type: "string", description: "Talk-track for the main objection, or how to uncover one" },
    whatsappMessage: { type: "string", description: "A ready-to-send, friendly WhatsApp message under 600 characters" },
    riskFlags: { type: "array", items: { type: "string" }, description: "Deal risks, empty if none" },
  },
};

export async function aiLeadInsight(context: Record<string, unknown>): Promise<LeadInsight> {
  return structured({
    schema: leadInsightJson,
    validator: leadInsightSchema,
    effort: "medium",
    content: `Analyse this solar lead and coach the salesperson.\n\n<lead_data>\n${JSON.stringify(context, null, 2)}\n</lead_data>`,
  });
}

// ─── Electricity bill extraction (vision) ────────────────────────────────

export const billExtractSchema = z.object({
  consumerName: z.string().nullable(),
  consumerNumber: z.string().nullable(),
  discom: z.string().nullable(),
  billAmount: z.number().nullable(),
  unitsConsumed: z.number().nullable(),
  billingPeriodMonths: z.number().nullable(),
  sanctionedLoadKw: z.number().nullable(),
  phase: z.enum(["SINGLE", "THREE"]).nullable(),
  tariffCategory: z.string().nullable(),
  address: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string(),
});
export type BillExtract = z.infer<typeof billExtractSchema>;

const nullable = (type: string, description: string) => ({ type: [type, "null"], description });

const billExtractJson: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "consumerName", "consumerNumber", "discom", "billAmount", "unitsConsumed", "billingPeriodMonths",
    "sanctionedLoadKw", "phase", "tariffCategory", "address", "confidence", "notes",
  ],
  properties: {
    consumerName: nullable("string", "Name on the bill"),
    consumerNumber: nullable("string", "Consumer / service connection number"),
    discom: nullable("string", "Electricity distribution company, e.g. TNPDCL, BESCOM, MSEDCL, Tata Power-DDL"),
    billAmount: nullable("number", "Net amount payable in rupees for this bill"),
    unitsConsumed: nullable("number", "kWh units consumed in this billing period"),
    billingPeriodMonths: nullable("number", "Length of the billing period in months (1 or 2 typically)"),
    sanctionedLoadKw: nullable("number", "Sanctioned / connected load in kW"),
    phase: { type: ["string", "null"], enum: ["SINGLE", "THREE", null], description: "Supply phase if stated" },
    tariffCategory: nullable("string", "Tariff category e.g. LT-1A Domestic"),
    address: nullable("string", "Service address"),
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    notes: { type: "string", description: "Anything unclear or worth flagging; empty string if none" },
  },
};

export async function aiExtractBill(base64: string, mediaType: string): Promise<BillExtract> {
  const isPdf = mediaType === "application/pdf";
  const doc: Anthropic.Beta.Messages.BetaContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : {
        type: "image",
        source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 },
      };
  return structured({
    schema: billExtractJson,
    validator: billExtractSchema,
    effort: "medium",
    content: [
      doc,
      {
        type: "text",
        text: "Extract the fields from this Indian electricity bill. Use null for anything not visible. Units must be the kWh consumed in the period, not meter readings.",
      },
    ],
  });
}

// ─── WhatsApp reply drafting ─────────────────────────────────────────────

export async function aiDraftReply(lead: Record<string, unknown>, conversation: { direction: string; body: string }[]) {
  const convo = conversation.map((m) => `${m.direction === "IN" ? "Customer" : "Us"}: ${m.body}`).join("\n");
  return plainText(
    `Draft the next WhatsApp reply from the solar company to this customer. Reply in the customer's language/style (English, Tamil, Hindi or Hinglish as they use). Under 500 characters, warm and specific, end with a clear question or next step. Output only the message text.\n\n<lead>\n${JSON.stringify(lead)}\n</lead>\n<conversation>\n${convo}\n</conversation>`,
  );
}

// ─── Dashboard brief ─────────────────────────────────────────────────────

export async function aiDailyBrief(stats: Record<string, unknown>) {
  return plainText(
    `Write today's sales brief for the solar company owner from these CRM numbers. 4-6 short bullet points ("- " prefix): what's going well, what needs attention (stale hot leads, unverified quotations, no-shows), and 2 concrete actions for today. No preamble.\n\n<stats>\n${JSON.stringify(stats, null, 2)}\n</stats>`,
  );
}

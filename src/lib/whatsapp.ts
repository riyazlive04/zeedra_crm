import "server-only";
import crypto from "node:crypto";
import { db } from "./db";
import { renderTemplate, templateVariables } from "./text";
import { logActivity } from "./activity";

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v23.0"}`;

export interface SendResult {
  id: string;
  status: string;
  error?: string;
  /** Click-to-chat link — used as a manual fallback when the Cloud API is not configured. */
  waLink: string;
}

export function waLink(phone: string, body: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
}

/**
 * Sends a WhatsApp message via the Meta Cloud API.
 * - If the template has an approved Meta template name, sends a template message (works outside the 24h window).
 * - Otherwise sends a free-form text (valid inside the 24h customer-service window).
 * - If the tenant has not connected WhatsApp, the message is recorded as SIMULATED with a wa.me link.
 */
export async function sendWhatsApp(opts: {
  orgId: string;
  phone: string;
  body?: string;
  templateKey?: string;
  vars?: Record<string, string | number | null | undefined>;
  leadId?: string | null;
  userId?: string | null;
  automated?: boolean;
}): Promise<SendResult> {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: opts.orgId },
    select: { waPhoneNumberId: true, waAccessToken: true },
  });

  let body = opts.body ?? "";
  let metaTemplate: { name: string; language: string; params: string[] } | null = null;
  if (opts.templateKey) {
    const t = await db.messageTemplate.findUnique({
      where: { organizationId_key: { organizationId: opts.orgId, key: opts.templateKey } },
    });
    if (!t || !t.active) throw new Error(`Template "${opts.templateKey}" not found or inactive`);
    body = renderTemplate(t.body, opts.vars ?? {});
    if (t.metaTemplateName) {
      metaTemplate = {
        name: t.metaTemplateName,
        language: t.language,
        params: templateVariables(t.body).map((v) => String(opts.vars?.[v] ?? "-")),
      };
    }
  }
  if (!body.trim()) throw new Error("Message body is empty");

  const msg = await db.whatsAppMessage.create({
    data: {
      organizationId: opts.orgId,
      leadId: opts.leadId ?? null,
      phone: opts.phone,
      direction: "OUT",
      body,
      templateKey: opts.templateKey ?? null,
      status: "QUEUED",
      automated: opts.automated ?? false,
      sentById: opts.userId ?? null,
    },
  });

  let status = "SIMULATED";
  let error: string | undefined;
  let providerId: string | undefined;

  if (org.waPhoneNumberId && org.waAccessToken) {
    const payload = metaTemplate
      ? {
          messaging_product: "whatsapp",
          to: opts.phone,
          type: "template",
          template: {
            name: metaTemplate.name,
            language: { code: metaTemplate.language },
            components: metaTemplate.params.length
              ? [{ type: "body", parameters: metaTemplate.params.map((text) => ({ type: "text", text })) }]
              : [],
          },
        }
      : { messaging_product: "whatsapp", to: opts.phone, type: "text", text: { preview_url: true, body } };
    try {
      const res = await fetch(`${GRAPH}/${org.waPhoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${org.waAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { message?: string; code?: number };
      };
      if (res.ok && json.messages?.[0]?.id) {
        status = "SENT";
        providerId = json.messages[0].id;
      } else {
        status = "FAILED";
        error = json.error?.message ?? `HTTP ${res.status}`;
        if (json.error?.code === 131047) error = "Outside 24-hour window — use an approved Meta template for this message.";
      }
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : "Network error";
    }
  }

  await db.whatsAppMessage.update({ where: { id: msg.id }, data: { status, providerId, error } });
  if (opts.leadId) {
    await db.lead.update({ where: { id: opts.leadId }, data: { lastContactAt: new Date() } });
    await logActivity({
      orgId: opts.orgId,
      leadId: opts.leadId,
      userId: opts.userId,
      type: "WHATSAPP",
      title: `${opts.automated ? "Auto " : ""}WhatsApp ${status === "FAILED" ? "failed" : "sent"}${opts.templateKey ? ` · ${opts.templateKey}` : ""}`,
      body: error ? `${body}\n\nError: ${error}` : body,
    });
  }
  return { id: msg.id, status, error, waLink: waLink(opts.phone, body) };
}

/** Verifies Meta's X-Hub-Signature-256 header when WHATSAPP_APP_SECRET is configured. */
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

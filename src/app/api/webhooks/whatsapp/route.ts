import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyMetaSignature } from "@/lib/whatsapp";
import { createLead } from "@/lib/services/leads";
import { fireTrigger } from "@/lib/automation/engine";
import { logActivity, notify } from "@/lib/activity";

/** Meta webhook verification handshake. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

interface WaChange {
  value?: {
    metadata?: { phone_number_id?: string };
    contacts?: { profile?: { name?: string }; wa_id?: string }[];
    messages?: { id: string; from: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string } } }[];
    statuses?: { id: string; status: string; errors?: { title?: string }[] }[];
  };
}

const STATUS_MAP: Record<string, string> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };
const STATUS_RANK: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };

/** Inbound messages (auto-creates leads for unknown numbers) and delivery receipts. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Invalid signature", { status: 401 });

  let payload: { entry?: { changes?: WaChange[] }[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      const phoneNumberId = v?.metadata?.phone_number_id;
      if (!v || !phoneNumberId) continue;
      const org = await db.organization.findFirst({ where: { waPhoneNumberId: phoneNumberId }, select: { id: true } });
      if (!org) continue;

      for (const s of v.statuses ?? []) {
        const status = STATUS_MAP[s.status];
        if (!status) continue;
        const msg = await db.whatsAppMessage.findUnique({ where: { providerId: s.id } });
        // Receipts can arrive out of order — never downgrade READ to DELIVERED.
        if (msg && (STATUS_RANK[status] ?? 0) > (STATUS_RANK[msg.status] ?? 0))
          await db.whatsAppMessage.update({ where: { id: msg.id }, data: { status, error: s.errors?.[0]?.title ?? msg.error } });
      }

      for (const m of v.messages ?? []) {
        if (await db.whatsAppMessage.findUnique({ where: { providerId: m.id } })) continue; // Meta retries
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? `[${m.type} message]`;
        const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? "WhatsApp enquiry";
        let lead = await db.lead.findFirst({ where: { organizationId: org.id, phone: m.from } });
        if (!lead) {
          const r = await createLead(org.id, { name, phone: m.from, source: "WHATSAPP" });
          lead = r.lead;
        }
        await db.whatsAppMessage.create({
          data: { organizationId: org.id, leadId: lead.id, phone: m.from, direction: "IN", body: text, status: "RECEIVED", providerId: m.id },
        });
        await db.lead.update({ where: { id: lead.id }, data: { lastContactAt: new Date() } });
        await logActivity({ orgId: org.id, leadId: lead.id, type: "WHATSAPP", title: "WhatsApp received", body: text });
        if (lead.assignedToId) await notify(org.id, lead.assignedToId, `💬 ${lead.name}`, text.slice(0, 140), `/whatsapp?lead=${lead.id}`);
        await fireTrigger("WHATSAPP_RECEIVED", { orgId: org.id, leadId: lead.id, refKey: `wa-in:${m.id}` });
      }
    }
  }
  return NextResponse.json({ ok: true });
}

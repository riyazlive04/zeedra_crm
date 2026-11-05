import { type NextRequest } from "next/server";
import { ingestLeadgenEvent, verifyMetaLeadsSignature } from "@/lib/services/meta-leads";

/** Meta webhook verification handshake (Page object → leadgen field). */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = process.env.META_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

interface LeadgenChange {
  field?: string;
  value?: { leadgen_id?: string; page_id?: string; form_id?: string };
}

/** New Facebook / Instagram Lead Ads submissions for connected Pages. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaLeadsSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Invalid signature", { status: 401 });
  let payload: { object?: string; entry?: { id?: string; changes?: LeadgenChange[] }[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const pageId = change.value?.page_id ?? entry.id;
      const leadgenId = change.value?.leadgen_id;
      if (change.field !== "leadgen" || !pageId || !leadgenId) continue;
      try {
        await ingestLeadgenEvent(pageId, leadgenId);
      } catch (e) {
        // Acknowledge anyway: the scheduled sync picks the submission up on its next run.
        console.warn("Meta leadgen webhook:", leadgenId, e instanceof Error ? e.message : e);
      }
    }
  }
  return new Response("ok", { status: 200 });
}

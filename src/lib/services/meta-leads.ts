import "server-only";
import crypto from "node:crypto";
import { Prisma, type Organization } from "@prisma/client";
import { db } from "../db";
import { ApiError } from "../errors";
import { logActivity } from "../activity";
import { leadCreateSchema } from "../validators";
import { createLead } from "./leads";
import { mapMetaFields, type MetaFieldDatum } from "../meta-lead-fields";

/**
 * Meta Lead Ads (Facebook & Instagram instant forms) → leads.
 *  - Webhook: Meta posts a `leadgen` change for the connected Page; we fetch that submission.
 *  - Sync: pulls every form's recent submissions — catches anything a webhook missed, and is
 *    what the scheduler runs.
 * Each submission is recorded in MetaLead once per org, so it never becomes two leads.
 */

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || process.env.WHATSAPP_API_VERSION || "v23.0"}`;
const LEAD_FIELDS = "id,created_time,field_data,form_id,ad_name,campaign_name,platform";

interface GraphLead {
  id: string;
  created_time: string;
  field_data?: MetaFieldDatum[];
  form_id?: string;
  ad_name?: string;
  campaign_name?: string;
  platform?: string;
}

async function graph<T>(path: string, token: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET"): Promise<T> {
  const url = new URL(GRAPH + path);
  const body = new URLSearchParams({ ...params, access_token: token });
  if (method === "GET") body.forEach((v, k) => url.searchParams.set(k, v));
  const res = await fetch(url, method === "POST" ? { method, body } : { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) throw new ApiError(res.status === 200 ? 502 : res.status >= 400 && res.status < 500 ? 400 : 502, `Meta: ${json.error?.message ?? res.statusText}`);
  return json;
}

/** Follows Graph API pagination (`paging.next`) up to a safety limit. */
async function graphAll<T>(path: string, token: string, params: Record<string, string>, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  let page = await graph<{ data: T[]; paging?: { next?: string } }>(path, token, params);
  out.push(...page.data);
  for (let i = 1; i < maxPages && page.paging?.next; i++) {
    const res = await fetch(page.paging.next, { cache: "no-store" });
    page = (await res.json()) as typeof page;
    if (!res.ok || !Array.isArray(page.data)) break;
    out.push(...page.data);
  }
  return out;
}

/**
 * Connects a Facebook Page: accepts a Page access token, or a user token from a Page admin
 * (exchanged for that Page's token), then subscribes this app to the Page's `leadgen` events.
 */
export async function connectMetaPage(orgId: string, pageId: string, accessToken: string) {
  const page = await graph<{ id: string; name: string; access_token?: string }>(`/${encodeURIComponent(pageId)}`, accessToken, { fields: "id,name,access_token" });
  const pageToken = page.access_token ?? accessToken;
  const other = await db.organization.findFirst({ where: { metaPageId: page.id, NOT: { id: orgId } }, select: { id: true } });
  if (other) throw new ApiError(409, "This Facebook Page is already connected to another account.");
  // Reading forms proves the token carries leads_retrieval; subscribing turns on the webhook.
  await graph(`/${page.id}/leadgen_forms`, pageToken, { fields: "id", limit: "1" });
  let webhook = true;
  try {
    await graph(`/${page.id}/subscribed_apps`, pageToken, { subscribed_fields: "leadgen" }, "POST");
  } catch {
    webhook = false; // still works through Sync / the scheduler
  }
  await db.organization.update({ where: { id: orgId }, data: { metaPageId: page.id, metaPageName: page.name, metaPageToken: pageToken } });
  return { pageId: page.id, pageName: page.name, webhook };
}

export async function disconnectMetaPage(orgId: string) {
  await db.organization.update({ where: { id: orgId }, data: { metaPageId: null, metaPageName: null, metaPageToken: null, metaLeadsSyncedAt: null } });
}

type OrgLite = Pick<Organization, "id" | "metaPageId" | "metaPageToken">;

/** Turns one submission into a lead (or records why it couldn't). Returns "created" | "duplicate" | "skipped" | "seen". */
async function ingest(org: OrgLite, l: GraphLead, formNames: Map<string, string>): Promise<"created" | "duplicate" | "skipped" | "seen"> {
  const seen = await db.metaLead.findUnique({ where: { organizationId_leadgenId: { organizationId: org.id, leadgenId: l.id } }, select: { id: true } });
  if (seen) return "seen";

  const fields = l.field_data ?? [];
  const m = mapMetaFields(fields);
  const formName = l.form_id ? formNames.get(l.form_id) : undefined;
  const base = {
    organizationId: org.id,
    leadgenId: l.id,
    pageId: org.metaPageId ?? "",
    formId: l.form_id ?? null,
    formName: formName ?? null,
    adName: l.ad_name ?? null,
    campaignName: l.campaign_name ?? null,
    platform: l.platform ?? null,
    submittedAt: new Date(l.created_time),
    fields: fields as unknown as Prisma.InputJsonValue,
  };
  // Claim the submission first: if a webhook and a sync race, only one of them makes the lead.
  let claim;
  try {
    claim = await db.metaLead.create({ data: base });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "seen";
    throw e;
  }

  const candidate: Record<string, unknown> = {
    name: m.name || "Facebook lead",
    phone: m.phone ?? "",
    email: m.email,
    city: m.city,
    state: m.state,
    pincode: m.pincode,
    address: m.address,
    monthlyBill: m.monthlyBill,
    monthlyUnits: m.monthlyUnits,
    ownsProperty: m.ownsProperty,
    source: l.platform === "ig" ? "INSTAGRAM" : "FACEBOOK",
    campaign: l.campaign_name || formName || null,
    segment: "RESIDENTIAL",
  };
  let parsed = leadCreateSchema.safeParse(candidate);
  if (!parsed.success) {
    // Drop whichever optional answers failed validation — a bad email shouldn't lose the lead.
    const bad = new Set(parsed.error.issues.map((i) => String(i.path[0])));
    if (bad.has("phone") || bad.has("name")) {
      await db.metaLead.update({ where: { id: claim.id }, data: { error: bad.has("phone") ? "No valid phone number in the form" : "No name in the form" } });
      return "skipped";
    }
    bad.forEach((k) => delete candidate[k]);
    parsed = leadCreateSchema.safeParse(candidate);
    if (!parsed.success) {
      await db.metaLead.update({ where: { id: claim.id }, data: { error: parsed.error.issues[0]?.message ?? "Invalid form answers" } });
      return "skipped";
    }
  }

  const { lead, duplicate } = await createLead(org.id, parsed.data);
  await db.metaLead.update({ where: { id: claim.id }, data: { leadId: lead.id } });
  const answers = m.extras.map((x) => `${x.question}: ${x.answer}`).join("\n");
  await logActivity({
    orgId: org.id,
    leadId: lead.id,
    type: "SYSTEM",
    title: `${l.platform === "ig" ? "Instagram" : "Facebook"} lead form${formName ? ` · ${formName}` : ""}`,
    body: [l.campaign_name && `Campaign: ${l.campaign_name}`, l.ad_name && `Ad: ${l.ad_name}`, answers].filter(Boolean).join("\n") || undefined,
    meta: { metaLeadgenId: l.id, formId: l.form_id ?? null } as Prisma.InputJsonValue,
  });
  return duplicate ? "duplicate" : "created";
}

async function formNameMap(org: OrgLite): Promise<Map<string, string>> {
  const forms = await graphAll<{ id: string; name: string }>(`/${org.metaPageId}/leadgen_forms`, org.metaPageToken!, { fields: "id,name", limit: "100" });
  return new Map(forms.map((f) => [f.id, f.name]));
}

/** Webhook path: fetch one submission by its leadgen id. */
export async function ingestLeadgenEvent(pageId: string, leadgenId: string) {
  const org = await db.organization.findFirst({ where: { metaPageId: pageId }, select: { id: true, metaPageId: true, metaPageToken: true } });
  if (!org?.metaPageToken) return "unknown-page" as const;
  const l = await graph<GraphLead>(`/${encodeURIComponent(leadgenId)}`, org.metaPageToken, { fields: LEAD_FIELDS });
  const names = new Map<string, string>();
  if (l.form_id) {
    const f = await graph<{ name?: string }>(`/${l.form_id}`, org.metaPageToken, { fields: "name" }).catch(() => null);
    if (f?.name) names.set(l.form_id, f.name);
  }
  return ingest(org, l, names);
}

export interface MetaSyncSummary {
  forms: number;
  fetched: number;
  created: number;
  duplicate: number;
  skipped: number;
}

/**
 * Pulls submissions from every lead form on the connected Page since the last sync (with a day
 * of overlap), or the last 30 days on the first sync.
 */
export async function syncMetaLeads(orgId: string): Promise<MetaSyncSummary> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { id: true, metaPageId: true, metaPageToken: true, metaLeadsSyncedAt: true } });
  if (!org.metaPageId || !org.metaPageToken) throw new ApiError(400, "Connect a Facebook Page first.");
  const startedAt = new Date();
  const since = org.metaLeadsSyncedAt ? org.metaLeadsSyncedAt.getTime() - 86_400_000 : startedAt.getTime() - 30 * 86_400_000;
  const names = await formNameMap(org);
  const summary: MetaSyncSummary = { forms: names.size, fetched: 0, created: 0, duplicate: 0, skipped: 0 };
  for (const formId of names.keys()) {
    const leads = await graphAll<GraphLead>(`/${formId}/leads`, org.metaPageToken, {
      fields: LEAD_FIELDS,
      limit: "100",
      filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(since / 1000) }]),
    });
    for (const l of leads) {
      summary.fetched++;
      const r = await ingest(org, { ...l, form_id: l.form_id ?? formId }, names);
      if (r === "created") summary.created++;
      else if (r === "duplicate") summary.duplicate++;
      else if (r === "skipped") summary.skipped++;
    }
  }
  await db.organization.update({ where: { id: org.id }, data: { metaLeadsSyncedAt: startedAt } });
  return summary;
}

/** Scheduler: sync every connected Page; one Page failing doesn't stop the others. */
export async function syncAllMetaLeads() {
  const orgs = await db.organization.findMany({ where: { metaPageId: { not: null }, metaPageToken: { not: null } }, select: { id: true } });
  let created = 0;
  let failed = 0;
  for (const o of orgs) {
    try {
      created += (await syncMetaLeads(o.id)).created;
    } catch (e) {
      failed++;
      console.warn("Meta lead sync failed for org", o.id, e instanceof Error ? e.message : e);
    }
  }
  return { metaPages: orgs.length, metaLeadsCreated: created, metaSyncFailed: failed };
}

/** X-Hub-Signature-256 check for the Lead Ads webhook (META_APP_SECRET, or the WhatsApp app's secret). */
export function verifyMetaLeadsSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // submissions are re-fetched from Meta with our token, so a forged id gets nowhere
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

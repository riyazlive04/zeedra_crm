import { readForm, route } from "@/lib/api";
import { leadCreateSchema, SOURCES, SEGMENTS } from "@/lib/validators";
import { createLead } from "@/lib/services/leads";
import { parseCSV } from "@/lib/text";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/activity";

// Flexible header matching so exports from Facebook Lead Ads, IndiaMART, Excel etc. import cleanly.
const HEADER_MAP: Record<string, string> = {
  name: "name", "full name": "name", "full_name": "name", customer: "name", "customer name": "name",
  phone: "phone", mobile: "phone", "phone number": "phone", "phone_number": "phone", "mobile number": "phone", whatsapp: "phone",
  email: "email", "email address": "email",
  city: "city", town: "city", address: "address", pincode: "pincode", "pin code": "pincode", pin: "pincode", state: "state",
  source: "source", campaign: "campaign", "campaign name": "campaign", "campaign_name": "campaign",
  segment: "segment", type: "segment",
  bill: "monthlyBill", "monthly bill": "monthlyBill", "eb bill": "monthlyBill", "electricity bill": "monthlyBill", monthlybill: "monthlyBill",
  units: "monthlyUnits", "monthly units": "monthlyUnits",
  "own house": "ownsProperty", owner: "ownsProperty", "owns property": "ownsProperty",
  notes: "notes",
};

const truthy = (v: string) => /^(y|yes|true|1|own|owned)$/i.test(v.trim());

export const POST = route("leads:import", async ({ req, session }) => {
  const form = await readForm(req);
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Upload a CSV file");
  if (file.size > 5 * 1024 * 1024) throw new ApiError(400, "CSV must be under 5 MB");
  const defaultSource = String(form.get("source") ?? "OTHER");

  const rows = parseCSV(await file.text());
  if (rows.length < 2) throw new ApiError(400, "CSV has no data rows");
  if (rows.length > 5001) throw new ApiError(400, "Import up to 5,000 rows at a time");
  const headers = rows[0].map((h) => HEADER_MAP[h.trim().toLowerCase()] ?? null);
  if (!headers.includes("name") || !headers.includes("phone")) throw new ApiError(400, "CSV needs at least 'name' and 'phone' columns");

  let created = 0;
  let duplicates = 0;
  const errors: { row: number; error: string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const rec: Record<string, unknown> = {};
    rows[i].forEach((v, j) => {
      const key = headers[j];
      if (!key || !v.trim()) return;
      if (key === "ownsProperty") rec[key] = truthy(v);
      else if (key === "source") rec[key] = (SOURCES as readonly string[]).includes(v.trim().toUpperCase()) ? v.trim().toUpperCase() : undefined;
      else if (key === "segment") rec[key] = (SEGMENTS as readonly string[]).includes(v.trim().toUpperCase()) ? v.trim().toUpperCase() : undefined;
      else if (key === "monthlyBill" || key === "monthlyUnits") rec[key] = Number(v.replace(/[^\d.]/g, "")) || undefined;
      else if (key !== "notes") rec[key] = v.trim();
    });
    rec.source ??= (SOURCES as readonly string[]).includes(defaultSource) ? defaultSource : "OTHER";
    const parsed = leadCreateSchema.safeParse(rec);
    if (!parsed.success) {
      errors.push({ row: i + 1, error: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
      continue;
    }
    try {
      const r = await createLead(session.orgId, parsed.data, session.userId);
      if (r.duplicate) duplicates++;
      else created++;
    } catch (e) {
      errors.push({ row: i + 1, error: e instanceof Error ? e.message : "Failed" });
    }
  }
  await audit({ orgId: session.orgId, userId: session.userId, action: "import", entity: "lead", meta: { created, duplicates, errors: errors.length } });
  return { created, duplicates, errors: errors.slice(0, 50), failed: errors.length };
});

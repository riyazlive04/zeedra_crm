import { readForm, route } from "@/lib/api";
import { aiEnabled, aiExtractBill, describeAiError } from "@/lib/ai";
import { ApiError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Reads an electricity bill photo/PDF and returns structured fields to pre-fill qualification. */
export const POST = route("leads:edit", async ({ req, session }) => {
  if (!aiEnabled()) throw new ApiError(503, "Bill reading needs AI. Add ANTHROPIC_API_KEY in your environment to enable it.");
  await rateLimit(`ai-bill:${session.orgId}`, 200, 3600);
  const form = await readForm(req);
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Attach a bill image or PDF");
  if (!ALLOWED.includes(file.type)) throw new ApiError(400, "Use a JPG, PNG, WEBP or PDF file");
  if (file.size > 8 * 1024 * 1024) throw new ApiError(400, "File must be under 8 MB");
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    const bill = await aiExtractBill(base64, file.type);
    // Normalise bi-monthly bills (common in Tamil Nadu, Kerala) to monthly figures.
    const months = bill.billingPeriodMonths && bill.billingPeriodMonths > 0 ? bill.billingPeriodMonths : 1;
    return {
      ...bill,
      monthlyBill: bill.billAmount != null ? Math.round(bill.billAmount / months) : null,
      monthlyUnits: bill.unitsConsumed != null ? Math.round(bill.unitsConsumed / months) : null,
    };
  } catch (e) {
    throw new ApiError(502, describeAiError(e));
  }
});

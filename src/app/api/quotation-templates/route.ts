import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { aiEnabled, aiQuotationTemplateFromPdf, describeAiError } from "@/lib/ai";
import { ITEM_FIELDS, PAYMENT_FIELDS, TEMPLATE_FIELDS, sanitizeTemplate } from "@/lib/quote-template";
import { rateLimit } from "@/lib/rate-limit";

// Converting a multi-page PDF can take a minute or two.
export const maxDuration = 300;

export const GET = route("settings:manage", async ({ session }) =>
  db.quotationTemplate.findMany({
    where: { organizationId: session.orgId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, active: true, sourceFileName: true, html: true, updatedAt: true },
  }),
);

const MAX_PDF_BYTES = 15 * 1024 * 1024;

/** Upload a quotation PDF → AI rebuilds it as an HTML template (saved switched off, for review). */
export const POST = route("settings:manage", async ({ req, session }) => {
  if (!aiEnabled()) throw new ApiError(503, "PDF conversion needs the AI service. Add ANTHROPIC_API_KEY to the server settings.");
  await rateLimit(`qtpl:${session.orgId}`, 10, 3600);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Choose a PDF file to upload");
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new ApiError(400, "Please upload a PDF file");
  if (file.size > MAX_PDF_BYTES) throw new ApiError(413, "That PDF is larger than 15 MB. Please upload a smaller file.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new ApiError(400, "That file doesn't look like a PDF");
  let html: string;
  try {
    html = await aiQuotationTemplateFromPdf(bytes.toString("base64"), TEMPLATE_FIELDS, ITEM_FIELDS, PAYMENT_FIELDS);
  } catch (e) {
    throw new ApiError(502, describeAiError(e));
  }
  const name = String(form?.get("name") || file.name.replace(/\.pdf$/i, "")).slice(0, 120) || "Our quotation";
  return db.quotationTemplate.create({
    data: { organizationId: session.orgId, name, html: sanitizeTemplate(html), sourceFileName: file.name.slice(0, 200), createdById: session.userId },
    select: { id: true, name: true, active: true, sourceFileName: true, html: true, updatedAt: true },
  });
});

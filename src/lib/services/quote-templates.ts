import "server-only";
import { db } from "../db";
import type { QuotifySnapshot } from "../solar/quotify";
import { renderQuoteTemplate, sanitizeTemplate, templateContext, type QuoteMeta } from "../quote-template";

/**
 * Filled HTML for a quotation made with the organisation's own template, or null when the quote
 * uses the built-in design (made before a template was switched on, or the template was deleted).
 */
export async function renderedQuotationHtml(orgId: string, snap: QuotifySnapshot, meta: QuoteMeta): Promise<string | null> {
  if (!snap.templateId) return null;
  const tpl = await db.quotationTemplate.findFirst({ where: { id: snap.templateId, organizationId: orgId }, select: { html: true } });
  if (!tpl) return null;
  return sanitizeTemplate(renderQuoteTemplate(tpl.html, templateContext(snap, meta)));
}

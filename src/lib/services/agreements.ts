import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { parseSettings } from "../settings";
import { ApiError } from "../errors";
import { can } from "../rbac";
import type { Session } from "../session";
import { logActivity } from "../activity";
import { isQuotifySnapshot } from "../solar/quotify";
import { agreementConfig, agreementNotReady, formatAadhaar, maskAadhaar, stgProblem, type AgreementData } from "../solar/agreement";

/**
 * Loads a quotation's whole lineage for the agreement: the root (agreements hang off it), the
 * version the customer accepted, and the latest agreement made for it.
 */
export async function loadAgreementContext(session: Session, quotationId: string) {
  const q = await db.quotation.findFirst({ where: { id: quotationId, organizationId: session.orgId }, include: { lead: true, organization: true } });
  if (!q) throw new ApiError(404, "Quotation not found");
  const isOwner = q.createdById === session.userId || q.lead.assignedToId === session.userId;
  if (!isOwner && !can(session.role, "quotations:review")) throw new ApiError(404, "Quotation not found");
  const rootId = q.parentId ?? q.id;
  const versions = await db.quotation.findMany({ where: { organizationId: session.orgId, OR: [{ id: rootId }, { parentId: rootId }] }, orderBy: { version: "desc" } });
  const accepted = versions.find((v) => v.status === "ACCEPTED") ?? null;
  const latest = await db.agreement.findFirst({ where: { organizationId: session.orgId, quotationId: rootId }, orderBy: { createdAt: "desc" } });
  const s = parseSettings(q.organization.settings);
  return { q, rootId, accepted, latest, settings: s, cfg: agreementConfig(s, q.organization) };
}

export const agreementInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the agreement date."),
  cust_name: z.string().trim().min(1, "Write the customer name.").max(120),
  cust_address: z.string().trim().min(1, "Write the customer address.").max(300),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "PIN code must be 6 digits."),
  father: z.string().trim().max(80).default(""),
  /** Full number, or blank to keep the one already saved (last 4 digits). */
  aadhaar: z.string().trim().max(20).default(""),
  total: z.number().int().positive("Write the total project cost."),
  advance: z.number().int().min(0).default(0),
  stages: z.array(z.object({ name: z.string().trim().max(80), pct: z.number().min(0).max(100), when: z.string().trim().max(300) })).max(12),
  stamp: z.boolean(),
});
export type AgreementInput = z.infer<typeof agreementInputSchema>;

/** Makes a new agreement row. The response carries the full Aadhaar number; the saved row keeps the last 4 digits. */
export async function createAgreement(session: Session, quotationId: string, input: AgreementInput) {
  const { q, rootId, accepted, latest, cfg } = await loadAgreementContext(session, quotationId);
  if (!accepted) throw new ApiError(400, "Mark the quotation as accepted before making the agreement.");
  const notReady = agreementNotReady(cfg);
  if (notReady) throw new ApiError(400, `Fill your agreement details in Settings first: ${notReady}`);

  const fullAadhaar = input.aadhaar ? formatAadhaar(input.aadhaar) : "";
  if (input.aadhaar && !fullAadhaar) throw new ApiError(400, "Aadhaar number must be 12 digits.");
  if (input.advance > input.total) throw new ApiError(400, "The advance cannot be more than the total.");
  const stages = input.stages.map((st) => ({ ...st, when: st.when.replace(/\.+$/, "") })).filter((st) => st.name || st.pct || st.when);
  const sp = stgProblem(stages);
  if (sp) throw new ApiError(400, sp);

  const snap = isQuotifySnapshot(accepted.quoteData) ? accepted.quoteData : null;
  const prior = latest ? (latest.data as unknown as AgreementData) : null;
  const data: AgreementData = {
    date: input.date,
    cust_name: input.cust_name,
    cust_address: input.cust_address,
    pincode: input.pincode,
    father: input.father,
    aadhaar: fullAadhaar ? maskAadhaar(fullAadhaar) : (prior?.aadhaar ?? ""),
    total: input.total,
    advance: input.advance,
    stages,
    stamp: input.stamp,
    eb: snap?.customer.ebNumber || q.lead.consumerNumber || "",
    kw: accepted.systemKw,
    vendor_name: cfg.vendorName,
    vendor_address: cfg.vendorAddress,
    text: cfg.text,
  };
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { name: true } });
  const row = await db.agreement.create({
    data: {
      organizationId: session.orgId,
      quotationId: rootId,
      quoteNumber: accepted.number,
      custName: data.cust_name,
      data: data as unknown as Prisma.InputJsonValue,
      createdById: session.userId,
      createdByName: me?.name ?? null,
    },
  });
  await logActivity({
    orgId: session.orgId,
    leadId: q.leadId,
    userId: session.userId,
    type: "QUOTATION",
    title: `${latest ? "Agreement changed" : "Agreement made"} for ${accepted.number}`,
    meta: { quotationId: rootId, agreementId: row.id } as Prisma.InputJsonValue,
  });
  // The full Aadhaar number exists only in this response and the pages printed from it.
  return { ...row, createdAt: row.createdAt.toISOString(), data: fullAadhaar ? { ...data, aadhaar: fullAadhaar } : data };
}

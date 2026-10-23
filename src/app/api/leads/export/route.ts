import { route, searchParams } from "@/lib/api";
import { db } from "@/lib/db";
import { leadListWhere } from "@/lib/services/leads";
import { audit } from "@/lib/activity";

const esc = (v: unknown) => {
  if (v == null) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const GET = route("reports:view", async ({ req, session }) => {
  const where = leadListWhere(searchParams(req), session);
  const leads = await db.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: 20000, include: { assignedTo: { select: { name: true } } } });
  const cols = [
    "code", "name", "phone", "email", "source", "campaign", "segment", "stage", "temperature", "score", "city", "pincode",
    "monthlyBill", "monthlyUnits", "ownsProperty", "recommendedKw", "estimatedCost", "subsidyAmount", "installationTimeline",
    "paymentMode", "objection", "assignedTo", "nextFollowUpAt", "createdAt",
  ] as const;
  const lines = [cols.join(",")];
  for (const l of leads) {
    lines.push(cols.map((c) => esc(c === "assignedTo" ? l.assignedTo?.name : (l as Record<string, unknown>)[c])).join(","));
  }
  await audit({ orgId: session.orgId, userId: session.userId, action: "export", entity: "lead", meta: { count: leads.length } });
  return new Response("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

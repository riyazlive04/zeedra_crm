import "server-only";
import { db } from "./db";

/** Atomically increments a per-organisation sequence and returns the next value. */
export async function nextSequence(orgId: string, key: string): Promise<number> {
  const row = await db.counter.upsert({
    where: { organizationId_key: { organizationId: orgId, key } },
    create: { organizationId: orgId, key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return row.value;
}

export async function nextLeadCode(orgId: string) {
  return `LD-${String(await nextSequence(orgId, "lead")).padStart(5, "0")}`;
}

export async function nextQuotationNumber(orgId: string) {
  const y = new Date().getFullYear();
  return `QT-${y}-${String(await nextSequence(orgId, `quote-${y}`)).padStart(5, "0")}`;
}

export async function nextProjectCode(orgId: string) {
  return `PRJ-${String(await nextSequence(orgId, "project")).padStart(4, "0")}`;
}

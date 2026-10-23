import "server-only";
import { db } from "./db";
import { ApiError } from "./errors";

/**
 * Fixed-window rate limiter backed by the database so it works across multiple instances
 * (no Redis dependency). Used for login, public lead capture and webhooks.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);
  const row = await db.rateLimit.findUnique({ where: { key } });
  if (!row || row.resetAt < now) {
    await db.rateLimit.upsert({ where: { key }, create: { key, count: 1, resetAt }, update: { count: 1, resetAt } });
    return;
  }
  if (row.count >= limit) {
    const retry = Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000);
    throw new ApiError(429, `Too many attempts. Try again in ${retry}s.`);
  }
  await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
}

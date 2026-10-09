import { lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { rateLimits } from "@/db/schema";
import { hashIp } from "@/lib/crypto";

const windows = [
  { suffix: "minute", limit: 5, ms: 60 * 1000 },
  { suffix: "hour", limit: 50, ms: 60 * 60 * 1000 },
  { suffix: "day", limit: 200, ms: 24 * 60 * 60 * 1000 },
];

export function getClientIp(request: Request) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return (
    forwarded ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export async function checkCreateRateLimit(ip: string) {
  const db = getDb();
  const now = new Date();

  await db.delete(rateLimits).where(lt(rateLimits.resetAt, now));

  for (const window of windows) {
    const key = `create:${ip}:${window.suffix}`;
    const resetAt = new Date(now.getTime() + window.ms);
    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: 1, resetAt })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`${rateLimits.count} + 1`,
          updatedAt: now,
        },
      })
      .returning();

    if (row.count > window.limit) {
      return {
        ok: false as const,
        limit: window.limit,
        resetAt: row.resetAt,
      };
    }
  }

  return { ok: true as const };
}

// All documents share an IP budget so switching slugs cannot bypass it.
export async function checkUnlockRateLimit(ip: string) {
  const now = new Date();
  for (const window of [
    { suffix: "minute", limit: 10, ms: 60000 },
    { suffix: "hour", limit: 60, ms: 3600000 },
  ]) {
    const resetAt = new Date(now.getTime() + window.ms);
    const [row] = await getDb()
      .insert(rateLimits)
      .values({
        key: `unlock:${hashIp(ip)}:${window.suffix}`,
        count: 1,
        resetAt,
      })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`case when ${rateLimits.resetAt} <= ${now} then 1 else ${rateLimits.count} + 1 end`,
          resetAt: sql`case when ${rateLimits.resetAt} <= ${now} then ${resetAt} else ${rateLimits.resetAt} end`,
          updatedAt: now,
        },
      })
      .returning();
    if (row.count > window.limit)
      return { ok: false as const, resetAt: row.resetAt };
  }
  return { ok: true as const };
}

import { count, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { events, ingestionRuns, sources } from '@/lib/db/schema';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface DashboardSummary {
  pendingReviewCount: number;
  publishedLast7DaysCount: number;
  sourcesActiveCount: number;
  lastCronStatus: { status: string; started_at: Date } | null;
}

/* ------------------------------------------------------------------ */
/*  getDashboardSummary                                                 */
/* ------------------------------------------------------------------ */

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [pendingResult, publishedResult, activeSourcesResult, lastCronResult] = await Promise.all([
    // Pending review count
    db.select({ value: count() }).from(events).where(eq(events.status, 'pending_review')),

    // Published in last 7 days
    db
      .select({ value: count() })
      .from(events)
      .where(sql`${events.status} = 'published' AND ${events.published_at} >= ${sevenDaysAgo}`),

    // Active sources
    db.select({ value: count() }).from(sources).where(eq(sources.is_active, true)),

    // Last cron run (most recent ingestion_runs row)
    db
      .select({
        status: ingestionRuns.status,
        started_at: ingestionRuns.started_at,
      })
      .from(ingestionRuns)
      .orderBy(desc(ingestionRuns.started_at))
      .limit(1),
  ]);

  return {
    pendingReviewCount: pendingResult[0]?.value ?? 0,
    publishedLast7DaysCount: publishedResult[0]?.value ?? 0,
    sourcesActiveCount: activeSourcesResult[0]?.value ?? 0,
    lastCronStatus:
      lastCronResult.length > 0
        ? {
            status: lastCronResult[0]!.status,
            started_at: lastCronResult[0]!.started_at,
          }
        : null,
  };
}

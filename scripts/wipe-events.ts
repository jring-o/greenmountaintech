/**
 * scripts/wipe-events.ts
 *
 * Wipes all events, ingestion_runs, and audit_log rows. KEEPS the
 * sources table — you don't have to re-seed sources after running.
 *
 * Use after a bad ingestion run (e.g. wrong dates parsed) to start
 * the event data fresh without losing your source configuration or
 * having to re-run pnpm seed:sources, pnpm add:vcet, etc.
 *
 * Usage: pnpm wipe:events
 *
 * Requires confirmation: prints a count of what's about to be deleted
 * and waits 5 seconds. Cancel with Ctrl-C if you didn't mean it.
 */

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { auditLog, events, ingestionRuns, sources } from '@/lib/db/schema';

async function main() {
  const [eventsCount] = await db.select({ c: sql<number>`count(*)::int` }).from(events);
  const [runsCount] = await db.select({ c: sql<number>`count(*)::int` }).from(ingestionRuns);
  const [auditCount] = await db.select({ c: sql<number>`count(*)::int` }).from(auditLog);
  const [sourcesCount] = await db.select({ c: sql<number>`count(*)::int` }).from(sources);

  console.log('About to TRUNCATE:');
  console.log(`  events:         ${eventsCount?.c ?? 0} rows`);
  console.log(`  ingestion_runs: ${runsCount?.c ?? 0} rows`);
  console.log(`  audit_log:      ${auditCount?.c ?? 0} rows`);
  console.log('');
  console.log(`Keeping sources table (${sourcesCount?.c ?? 0} rows).`);
  console.log('');
  console.log('Cancel with Ctrl-C within 5s if this is wrong...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // CASCADE handles the events.merged_into self-FK and audit_log.event_id FK.
  // Wrap in transaction so it's atomic.
  await db.execute(sql`TRUNCATE TABLE audit_log, events, ingestion_runs RESTART IDENTITY CASCADE`);

  console.log('Done. events, ingestion_runs, audit_log wiped. sources preserved.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

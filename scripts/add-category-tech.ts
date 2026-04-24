/**
 * scripts/add-category-tech.ts
 *
 * Adds 'tech' to the Postgres event_category enum on the live DB.
 * Idempotent — uses ADD VALUE IF NOT EXISTS.
 *
 * This is a one-off because we can't currently generate a Drizzle
 * migration without colliding with a parallel branch's pending
 * 0001 migration. Once that branch merges, we'll regenerate a
 * proper migration that captures both this enum addition AND the
 * 'headless' adapter_type addition. The IF NOT EXISTS guard means
 * the regenerated migration is safe to apply on top of this script.
 *
 * Usage: pnpm add:category:tech
 */

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

async function main() {
  console.log("Adding 'tech' to event_category enum...");

  // ALTER TYPE ADD VALUE cannot run inside a transaction in older
  // Postgres versions; Neon allows it but we're explicit anyway.
  await db.execute(sql`ALTER TYPE event_category ADD VALUE IF NOT EXISTS 'tech'`);

  console.log("Done. event_category now includes 'tech'.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

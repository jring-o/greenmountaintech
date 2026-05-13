/**
 * scripts/add-meetup-nw-vt.ts
 *
 * Adds NW Vermont Technology Meetups (Meetup iCal) to `sources`, then runs
 * ingestion for that source. Idempotent upsert on `slug`.
 *
 * Usage: pnpm add:meetup:nw
 *
 * @see https://www.meetup.com/nw-vermont-technology-meetups/events/
 */

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { sources } from '@/lib/db/schema';
import { runOne } from '@/lib/ingest/runner';

const SOURCE = {
  name: 'NW Vermont Technology Meetups',
  slug: 'nw-vermont-technology-meetups',
  kind: 'whitelist' as const,
  adapter_type: 'ical' as const,
  adapter_key: 'generic',
  url: 'https://www.meetup.com/nw-vermont-technology-meetups/events/ical/',
  adapter_config: { default_category: 'tech' } as Record<string, unknown>,
  trust_level: 'auto_publish' as const,
  is_active: true,
  rate_limit_per_min: 30,
  robots_respect: true,
};

async function main() {
  console.log(`Upserting source: ${SOURCE.slug}`);

  const result = await db
    .insert(sources)
    .values({
      name: SOURCE.name,
      slug: SOURCE.slug,
      kind: SOURCE.kind,
      adapter_type: SOURCE.adapter_type,
      adapter_key: SOURCE.adapter_key,
      url: SOURCE.url,
      adapter_config: SOURCE.adapter_config,
      trust_level: SOURCE.trust_level,
      is_active: SOURCE.is_active,
      rate_limit_per_min: SOURCE.rate_limit_per_min,
      robots_respect: SOURCE.robots_respect,
    })
    .onConflictDoUpdate({
      target: sources.slug,
      set: {
        name: sql`EXCLUDED.name`,
        adapter_type: sql`EXCLUDED.adapter_type`,
        adapter_key: sql`EXCLUDED.adapter_key`,
        url: sql`EXCLUDED.url`,
        adapter_config: sql`EXCLUDED.adapter_config`,
        trust_level: sql`EXCLUDED.trust_level`,
        is_active: sql`EXCLUDED.is_active`,
        rate_limit_per_min: sql`EXCLUDED.rate_limit_per_min`,
        robots_respect: sql`EXCLUDED.robots_respect`,
        updated_at: sql`now()`,
      },
    })
    .returning({ id: sources.id, slug: sources.slug, is_active: sources.is_active });

  console.log('Upsert done:', result);

  const row = result[0];
  if (!row) {
    throw new Error('Upsert returned no row');
  }

  console.log('Running ingestion (fetch iCal, persist events)...');
  const summary = await runOne(row.id, 'manual');
  console.log('Ingest finished:', {
    status: summary.status,
    itemsFound: summary.itemsFound,
    itemsNew: summary.itemsNew,
    itemsUpdated: summary.itemsUpdated,
    itemsErrored: summary.itemsErrored,
    itemsDedupSkipped: summary.itemsDedupSkipped,
    durationMs: summary.durationMs,
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

/**
 * scripts/add-meetup.ts
 *
 * Adds a single source row (Vermont Technology Meetup iCal) to the `sources` table,
 * then runs ingestion for that source so events appear on the public calendar.
 * Idempotent upsert — uses ON CONFLICT (slug) DO UPDATE.
 *
 * Usage: pnpm add:meetup
 *
 * If you already ingested under `review` trust, events may be stuck in
 * `pending_review` (hidden from the public calendar / feed.ics). After
 * re-running this script, either approve them in admin or run:
 *
 *   UPDATE events SET status = 'published', published_at = COALESCE(published_at, now())
 *   WHERE source_id = (SELECT id FROM sources WHERE slug = 'vermont-technology-meetup')
 *     AND status = 'pending_review';
 *
 * Pattern for future ad-hoc source additions: copy `scripts/add-vcet.ts`,
 * tweak the SOURCE constant, run with a new pnpm script alias.
 */

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { sources } from '@/lib/db/schema';
import { runOne } from '@/lib/ingest/runner';

const SOURCE = {
  name: 'Vermont Technology Meetup',
  slug: 'vermont-technology-meetup',
  kind: 'whitelist' as const,
  adapter_type: 'ical' as const,
  adapter_key: 'generic',
  url: 'https://www.meetup.com/vermont-technology-meetup/events/ical/',
  // Generic iCal adapter: default_category is applied to every VEVENT.
  adapter_config: { default_category: 'tech' } as Record<string, unknown>,
  // Whitelist + auto_publish: new rows become `published` so they appear on the
  // site and `/feed.ics`. `review` would leave every ingest as `pending_review`,
  // which public queries intentionally exclude.
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

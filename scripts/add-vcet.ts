/**
 * scripts/add-vcet.ts
 *
 * Adds a single source row (VCET events RSS) to the `sources` table.
 * Idempotent — uses ON CONFLICT (slug) DO UPDATE.
 *
 * Usage: pnpm add:vcet
 *
 * Pattern for future ad-hoc source additions: copy this file,
 * tweak the SOURCE constant, run with a new pnpm script alias.
 */

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { sources } from '@/lib/db/schema';

const SOURCE = {
  name: 'VCET events',
  slug: 'vcet',
  kind: 'whitelist' as const,
  adapter_type: 'rss' as const,
  adapter_key: 'generic',
  url: 'https://vcet.co/category/events/feed/',
  // VCET's RSS items are blog posts; pubDate = publish time, not event time.
  // Use chrono-node on the body to find the event date in the text/slug.
  adapter_config: { parseDatesFromBody: true } as Record<string, unknown>,
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

  console.log('Done:', result);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

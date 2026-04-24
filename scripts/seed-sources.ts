/**
 * scripts/seed-sources.ts
 *
 * Seeds the 7 launch whitelist sources into the `sources` table.
 * Idempotent -- uses ON CONFLICT (slug) DO UPDATE SET ... so it can be
 * re-run safely without duplicating rows.
 *
 * iCal sources (rows 1-3) read their URL from env vars:
 *   SEED_URL_UVM_EVENTS, SEED_URL_CITY_BURLINGTON, SEED_URL_LCC_VERMONT
 * When unset, the row is inserted with is_active=false and name suffixed
 * ' (URL pending)'.
 *
 * HTML sources (rows 4-7) have known URLs and are always is_active=true.
 *
 * Usage: pnpm seed:sources
 */

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { sources } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Source definitions
// ---------------------------------------------------------------------------

interface SourceDef {
  name: string;
  slug: string;
  kind: 'whitelist';
  adapter_type: 'ical' | 'html';
  adapter_key: string;
  /** Static URL for HTML sources; undefined for iCal sources (read from env). */
  url?: string;
  /** Env var name that supplies the URL for iCal sources. */
  urlEnvVar?: string;
  adapter_config: Record<string, unknown>;
  trust_level: 'auto_publish';
}

const SOURCE_DEFS: SourceDef[] = [
  // Row 1 -- iCal
  {
    name: 'UVM Events',
    slug: 'uvm-events',
    kind: 'whitelist',
    adapter_type: 'ical',
    adapter_key: 'generic',
    urlEnvVar: 'SEED_URL_UVM_EVENTS',
    adapter_config: {},
    trust_level: 'auto_publish',
  },
  // Row 2 -- iCal
  {
    name: 'City of Burlington',
    slug: 'city-of-burlington',
    kind: 'whitelist',
    adapter_type: 'ical',
    adapter_key: 'generic',
    urlEnvVar: 'SEED_URL_CITY_BURLINGTON',
    adapter_config: {},
    trust_level: 'auto_publish',
  },
  // Row 3 -- iCal
  {
    name: 'Lake Champlain Chamber',
    slug: 'lake-champlain-chamber',
    kind: 'whitelist',
    adapter_type: 'ical',
    adapter_key: 'generic',
    urlEnvVar: 'SEED_URL_LCC_VERMONT',
    adapter_config: {},
    trust_level: 'auto_publish',
  },
  // Row 4 -- HTML
  {
    name: 'Vermont Public events',
    slug: 'vermont-public',
    kind: 'whitelist',
    adapter_type: 'html',
    adapter_key: 'vermont-public',
    url: 'https://www.vermontpublic.org/vermont-events-calendar',
    adapter_config: {},
    trust_level: 'auto_publish',
  },
  // Row 5 -- HTML
  {
    name: 'Seven Days community events',
    slug: 'seven-days',
    kind: 'whitelist',
    adapter_type: 'html',
    adapter_key: 'seven-days',
    url: 'https://community.sevendaysvt.com/vermont/EventSearch',
    adapter_config: { pages: 3 },
    trust_level: 'auto_publish',
  },
  // Row 6 -- HTML
  {
    name: 'Vermont.com calendar',
    slug: 'vermont-com',
    kind: 'whitelist',
    adapter_type: 'html',
    adapter_key: 'vermont-com',
    url: 'https://vermont.com/calendar/',
    adapter_config: {},
    trust_level: 'auto_publish',
  },
  // Row 7 -- HTML
  {
    name: 'helloburlingtonvt.com events',
    slug: 'hello-burlington-vt',
    kind: 'whitelist',
    adapter_type: 'html',
    adapter_key: 'hello-burlington-vt',
    url: 'https://helloburlingtonvt.com/events',
    adapter_config: {},
    trust_level: 'auto_publish',
  },
];

// ---------------------------------------------------------------------------
// Build rows
// ---------------------------------------------------------------------------

function buildRows() {
  return SOURCE_DEFS.map((def) => {
    // For iCal sources, resolve URL from env; fall back to pending state.
    const envUrl = def.urlEnvVar ? process.env[def.urlEnvVar] : undefined;
    const hasUrl = def.url != null || (envUrl != null && envUrl.length > 0);

    const resolvedUrl = def.url ?? envUrl ?? 'https://placeholder.invalid';
    const resolvedName = hasUrl ? def.name : `${def.name} (URL pending)`;
    const isActive = hasUrl;

    return {
      name: resolvedName,
      slug: def.slug,
      kind: def.kind,
      adapter_type: def.adapter_type,
      adapter_key: def.adapter_key,
      url: resolvedUrl,
      adapter_config: def.adapter_config,
      trust_level: def.trust_level,
      is_active: isActive,
    };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rows = buildRows();

  console.log(`Seeding ${rows.length} whitelist sources...`);
  for (const row of rows) {
    console.log(
      `  ${row.slug} | active=${String(row.is_active)} | ${row.adapter_type}/${row.adapter_key}`,
    );
    await db
      .insert(sources)
      .values(row)
      .onConflictDoUpdate({
        target: sources.slug,
        set: {
          name: sql`excluded.name`,
          kind: sql`excluded.kind`,
          adapter_type: sql`excluded.adapter_type`,
          adapter_key: sql`excluded.adapter_key`,
          url: sql`excluded.url`,
          adapter_config: sql`excluded.adapter_config`,
          trust_level: sql`excluded.trust_level`,
          is_active: sql`excluded.is_active`,
          updated_at: sql`now()`,
        },
      });
  }

  console.log('Done. All whitelist sources seeded.');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

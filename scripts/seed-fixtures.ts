/**
 * scripts/seed-fixtures.ts
 *
 * Seeds 15 hand-crafted published events covering every region and category
 * for the public calendar. Idempotent -- safe to re-run via stable UUIDs and
 * ON CONFLICT (id) DO NOTHING.
 *
 * Usage: pnpm seed:fixtures
 */

import crypto from 'node:crypto';

import { db } from '@/lib/db/client';
import { events } from '@/lib/db/schema';
import { toUtc, formatLocal, DEFAULT_TZ } from '@/lib/tz';

// ---------------------------------------------------------------------------
// UUIDv5 helper (RFC 4122) -- avoids adding a dependency for one function.
// Uses a project-specific namespace so IDs are deterministic and unique.
// ---------------------------------------------------------------------------

const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace UUID

function uuidv5(name: string): string {
  // Parse namespace UUID to bytes
  const ns = NAMESPACE.replace(/-/g, '');
  const nsBytes = Buffer.from(ns, 'hex');

  // Hash namespace + name with SHA-1
  const hash = crypto.createHash('sha1').update(nsBytes).update(name).digest();

  // Set version 5 (bits 4-7 of byte 6)
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  // Set variant (bits 6-7 of byte 8)
  hash[8] = (hash[8]! & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

// ---------------------------------------------------------------------------
// Slugify helper (spec 16.1 dedupe_key)
// ---------------------------------------------------------------------------

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// dedupe_key helper per spec: slugify(title)|yyyy-MM-dd|slugify(venueName)
// ---------------------------------------------------------------------------

function dedupeKey(
  title: string,
  startsAtUtc: Date,
  tzid: string,
  venueName: string | null,
): string {
  const dateStr = formatLocal(startsAtUtc, tzid, 'yyyy-MM-dd');
  return `${slugify(title)}|${dateStr}|${slugify(venueName ?? '')}`;
}

// ---------------------------------------------------------------------------
// Fixture definitions (local ET times, converted to UTC at insert time)
// ---------------------------------------------------------------------------

interface FixtureDef {
  slug: string;
  title: string;
  description?: string;
  description_html?: string;
  localTime: string; // ISO without offset, e.g. '2025-07-04T10:00:00'
  endLocalTime?: string;
  allDay?: boolean;
  venueName?: string;
  venueAddress?: string;
  region:
    | 'burlington_area'
    | 'champlain_valley'
    | 'central_vt'
    | 'northeast_kingdom'
    | 'southern_vt'
    | 'statewide';
  category:
    | 'music'
    | 'arts_theater'
    | 'food_drink'
    | 'community_civic'
    | 'outdoors_recreation'
    | 'family_kids'
    | 'education_lecture'
    | 'film'
    | 'sports'
    | 'farmers_market'
    | 'fundraiser'
    | 'other';
  imageUrl?: string;
  tags?: string[];
  url?: string;
}

const TZID = DEFAULT_TZ;

const fixtures: FixtureDef[] = [
  // 1. music + burlington_area + tags folk,live-music
  {
    slug: 'folk-fest-waterfront',
    title: 'Burlington Folk Festival',
    description:
      'Three days of folk music on the Burlington waterfront featuring local and national acts.',
    localTime: '2025-08-15T17:00:00',
    endLocalTime: '2025-08-15T22:00:00',
    venueName: 'Waterfront Park',
    venueAddress: 'Lake St, Burlington, VT 05401',
    region: 'burlington_area',
    category: 'music',
    imageUrl: 'https://example.com/images/folk-fest.jpg',
    tags: ['folk', 'live-music'],
    url: 'https://example.com/folk-fest',
  },
  // 2. arts_theater + champlain_valley
  {
    slug: 'shelburne-museum-art-show',
    title: 'Summer Art Show at Shelburne Museum',
    description_html:
      '<p>Juried exhibition of Vermont artists in the <strong>Webb Gallery</strong>. Free with museum admission.</p>',
    localTime: '2025-07-12T10:00:00',
    endLocalTime: '2025-07-12T17:00:00',
    venueName: 'Shelburne Museum',
    venueAddress: '6000 Shelburne Rd, Shelburne, VT 05482',
    region: 'champlain_valley',
    category: 'arts_theater',
    imageUrl: 'https://example.com/images/shelburne-art.jpg',
    url: 'https://example.com/shelburne-art',
  },
  // 3. food_drink + central_vt
  {
    slug: 'montpelier-beer-garden',
    title: 'Montpelier Summer Beer Garden',
    description:
      'Local craft brews and food trucks on the State House lawn every Thursday evening.',
    localTime: '2025-07-17T16:30:00',
    endLocalTime: '2025-07-17T20:30:00',
    venueName: 'Vermont State House Lawn',
    venueAddress: '115 State St, Montpelier, VT 05602',
    region: 'central_vt',
    category: 'food_drink',
  },
  // 4. community_civic + northeast_kingdom
  {
    slug: 'nek-town-meeting',
    title: 'St. Johnsbury Town Meeting Day',
    description:
      'Annual town meeting with community discussion, budget votes, and local official elections.',
    localTime: '2025-03-04T09:00:00',
    endLocalTime: '2025-03-04T16:00:00',
    venueName: 'St. Johnsbury Academy',
    venueAddress: '1000 Main St, St. Johnsbury, VT 05819',
    region: 'northeast_kingdom',
    category: 'community_civic',
  },
  // 5. outdoors_recreation + southern_vt
  {
    slug: 'manchester-trail-run',
    title: 'Green Mountain Trail Run 10K',
    description:
      'A scenic 10K trail run through the Green Mountain National Forest near Manchester.',
    localTime: '2025-09-20T08:00:00',
    endLocalTime: '2025-09-20T12:00:00',
    venueName: 'Equinox Preserve Trailhead',
    venueAddress: 'Seminary Ave, Manchester, VT 05254',
    region: 'southern_vt',
    category: 'outdoors_recreation',
    imageUrl: 'https://example.com/images/trail-run.jpg',
  },
  // 6. family_kids + statewide (all-day event)
  {
    slug: 'vt-open-farm-week',
    title: 'Vermont Open Farm Week',
    description:
      'Farms across the state open their doors for free tours, tastings, and family-friendly activities.',
    localTime: '2025-08-11T00:00:00',
    allDay: true,
    region: 'statewide',
    category: 'family_kids',
    url: 'https://example.com/open-farm-week',
  },
  // 7. education_lecture + burlington_area
  {
    slug: 'uvm-climate-lecture',
    title: 'Climate Resilience in Vermont: A Public Lecture',
    description_html:
      '<p>Dr. Emily Stanton discusses <em>climate adaptation strategies</em> for Vermont communities. Free and open to the public.</p>',
    localTime: '2025-10-08T18:30:00',
    endLocalTime: '2025-10-08T20:00:00',
    venueName: 'UVM Ira Allen Chapel',
    venueAddress: '26 University Pl, Burlington, VT 05401',
    region: 'burlington_area',
    category: 'education_lecture',
  },
  // 8. film + champlain_valley
  {
    slug: 'vergennes-outdoor-cinema',
    title: 'Movies Under the Stars: Vergennes',
    description:
      'Free outdoor screening of a family-friendly film in Vergennes City Park. Bring blankets!',
    localTime: '2025-07-25T20:30:00',
    endLocalTime: '2025-07-25T22:30:00',
    venueName: 'Vergennes City Park',
    venueAddress: 'Green St, Vergennes, VT 05491',
    region: 'champlain_valley',
    category: 'film',
  },
  // 9. sports + central_vt
  {
    slug: 'barre-softball-tournament',
    title: 'Barre Summer Softball Tournament',
    description:
      'Annual co-ed softball tournament benefiting Barre youth athletics. Teams of all skill levels welcome.',
    localTime: '2025-06-28T09:00:00',
    endLocalTime: '2025-06-28T17:00:00',
    venueName: 'Barre City Recreation Fields',
    venueAddress: 'Parkside Terrace, Barre, VT 05641',
    region: 'central_vt',
    category: 'sports',
    imageUrl: 'https://example.com/images/softball.jpg',
  },
  // 10. farmers_market + northeast_kingdom
  {
    slug: 'hardwick-farmers-market',
    title: 'Hardwick Farmers Market',
    description:
      'Weekly farmers market featuring produce, baked goods, and artisan crafts from the NEK.',
    localTime: '2025-07-11T09:00:00',
    endLocalTime: '2025-07-11T13:00:00',
    venueName: 'Atkins Field',
    venueAddress: 'Atkins Field, Hardwick, VT 05843',
    region: 'northeast_kingdom',
    category: 'farmers_market',
  },
  // 11. fundraiser + southern_vt
  {
    slug: 'brattleboro-benefit-gala',
    title: 'Brattleboro Arts Benefit Gala',
    description_html:
      '<p>Annual gala supporting the <strong>Brattleboro Museum & Art Center</strong>. Includes dinner, live auction, and dancing.</p>',
    localTime: '2025-11-08T18:00:00',
    endLocalTime: '2025-11-08T23:00:00',
    venueName: 'Latchis Hotel',
    venueAddress: '50 Main St, Brattleboro, VT 05301',
    region: 'southern_vt',
    category: 'fundraiser',
    imageUrl: 'https://example.com/images/brattleboro-gala.jpg',
  },
  // 12. other + statewide
  {
    slug: 'vt-craft-fair-swap',
    title: 'Vermont Community Craft & Swap Day',
    description:
      'Bring your gently used items to swap, plus local crafters selling handmade goods. Multiple locations statewide.',
    localTime: '2025-05-17T10:00:00',
    endLocalTime: '2025-05-17T15:00:00',
    region: 'statewide',
    category: 'other',
  },
  // 13. music + southern_vt (extra coverage)
  {
    slug: 'marlboro-chamber-music',
    title: 'Marlboro Music Festival Concert',
    description: 'World-class chamber music performed in the intimate Persons Auditorium.',
    localTime: '2025-07-19T19:30:00',
    endLocalTime: '2025-07-19T21:30:00',
    venueName: 'Persons Auditorium',
    venueAddress: '2572 South Rd, Marlboro, VT 05344',
    region: 'southern_vt',
    category: 'music',
    imageUrl: 'https://example.com/images/marlboro-music.jpg',
    tags: ['classical', 'chamber-music'],
  },
  // 14. outdoors_recreation + northeast_kingdom (extra coverage)
  {
    slug: 'burke-mountain-hike',
    title: 'Guided Hike: Burke Mountain Summit',
    description:
      'A guided 4-mile round-trip hike to the summit of Burke Mountain with a local naturalist.',
    localTime: '2025-08-02T07:30:00',
    endLocalTime: '2025-08-02T12:00:00',
    venueName: 'Burke Mountain Base Lodge',
    venueAddress: '223 Sherburne Lodge Rd, East Burke, VT 05832',
    region: 'northeast_kingdom',
    category: 'outdoors_recreation',
  },
  // 15. food_drink + burlington_area (extra coverage)
  {
    slug: 'btv-mac-cheese-fest',
    title: 'Burlington Mac & Cheese Festival',
    description_html:
      '<p>Taste <em>mac and cheese</em> creations from 20+ Vermont restaurants. Votes decide the champion!</p>',
    localTime: '2025-10-18T11:00:00',
    endLocalTime: '2025-10-18T16:00:00',
    venueName: 'ECHO Leahy Center',
    venueAddress: '1 College St, Burlington, VT 05401',
    region: 'burlington_area',
    category: 'food_drink',
    imageUrl: 'https://example.com/images/mac-cheese.jpg',
    tags: ['food-festival'],
    url: 'https://example.com/mac-cheese-fest',
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const now = new Date();

  const rows = fixtures.map((f) => {
    const startsAtUtc = f.allDay
      ? toUtc(`${f.localTime.slice(0, 10)}T00:00:00`, TZID)
      : toUtc(f.localTime, TZID);

    const endsAtUtc = f.endLocalTime != null ? toUtc(f.endLocalTime, TZID) : undefined;

    const id = uuidv5(`vermont-events-fixture:${f.slug}`);
    const dk = dedupeKey(f.title, startsAtUtc, TZID, f.venueName ?? null);

    return {
      id,
      source_id: null,
      title: f.title,
      description: f.description ?? null,
      description_html: f.description_html ?? null,
      starts_at_utc: startsAtUtc,
      ends_at_utc: endsAtUtc ?? null,
      tzid: TZID,
      all_day: f.allDay ?? false,
      venue_name: f.venueName ?? null,
      venue_address: f.venueAddress ?? null,
      region: f.region,
      category: f.category,
      image_url: f.imageUrl ?? null,
      url: f.url ?? null,
      status: 'published' as const,
      published_at: now,
      tags: f.tags ?? [],
      dedupe_key: dk,
    };
  });

  console.log(`Seeding ${rows.length} fixture events...`);

  await db.insert(events).values(rows).onConflictDoNothing({ target: events.id });

  console.log(`Done. ${rows.length} fixture events seeded (duplicates skipped).`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

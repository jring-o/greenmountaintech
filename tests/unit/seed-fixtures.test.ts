/**
 * tests/unit/seed-fixtures.test.ts
 *
 * Static-analysis tests for the S09 seed-fixtures script.
 * Validates fixture data structure, enum coverage, dedupe_key format,
 * idempotency design, and deterministic UUIDs -- all without a live database.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { toUtc, formatLocal, DEFAULT_TZ } from '@/lib/tz';

// ---------------------------------------------------------------------------
// Re-implement helpers from seed-fixtures.ts so we can test fixture data
// without importing the script (which has side-effectful db imports).
// ---------------------------------------------------------------------------

const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace UUID

function uuidv5(name: string): string {
  const ns = NAMESPACE.replace(/-/g, '');
  const nsBytes = Buffer.from(ns, 'hex');

  const hash = crypto.createHash('sha1').update(nsBytes).update(name).digest();

  hash[6] = (hash[6]! & 0x0f) | 0x50;
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

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
// Fixture definitions (copied from script for static analysis)
// ---------------------------------------------------------------------------

interface FixtureDef {
  slug: string;
  title: string;
  description?: string;
  description_html?: string;
  localTime: string;
  endLocalTime?: string;
  allDay?: boolean;
  venueName?: string;
  venueAddress?: string;
  region: string;
  category: string;
  imageUrl?: string;
  tags?: string[];
  url?: string;
}

const TZID = DEFAULT_TZ;

const fixtures: FixtureDef[] = [
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

// Compute rows the same way the script does for structural analysis
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
    published_at: new Date(),
    tags: f.tags ?? [],
    dedupe_key: dk,
  };
});

// ===================================================================
// Tests
// ===================================================================

describe('S09 seed-fixtures: script file existence', () => {
  it('scripts/seed-fixtures.ts exists on disk', () => {
    const filePath = path.resolve(__dirname, '../../scripts/seed-fixtures.ts');
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

describe('S09 seed-fixtures: fixture count', () => {
  it('has at least 12 fixture rows (EC-2)', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(12);
  });

  it('has exactly 15 fixtures as stated in build report', () => {
    expect(fixtures.length).toBe(15);
  });
});

describe('S09 seed-fixtures: region enum coverage (EC-3)', () => {
  const REQUIRED_REGIONS = [
    'burlington_area',
    'champlain_valley',
    'central_vt',
    'northeast_kingdom',
    'southern_vt',
    'statewide',
  ] as const;

  const fixtureRegions = new Set(fixtures.map((f) => f.region));

  it('covers all 6 region enum values', () => {
    expect(fixtureRegions.size).toBeGreaterThanOrEqual(6);
  });

  for (const region of REQUIRED_REGIONS) {
    it(`includes region "${region}"`, () => {
      expect(fixtureRegions.has(region)).toBe(true);
    });
  }
});

describe('S09 seed-fixtures: category enum coverage (EC-4)', () => {
  const REQUIRED_CATEGORIES = [
    'music',
    'arts_theater',
    'food_drink',
    'community_civic',
    'outdoors_recreation',
    'family_kids',
    'education_lecture',
    'film',
    'sports',
    'farmers_market',
    'fundraiser',
    'other',
  ] as const;

  const fixtureCategories = new Set(fixtures.map((f) => f.category));

  it('covers all 12 category enum values', () => {
    expect(fixtureCategories.size).toBeGreaterThanOrEqual(12);
  });

  for (const category of REQUIRED_CATEGORIES) {
    it(`includes category "${category}"`, () => {
      expect(fixtureCategories.has(category)).toBe(true);
    });
  }
});

describe('S09 seed-fixtures: all-day event', () => {
  it('at least one fixture has allDay = true', () => {
    const allDayEvents = fixtures.filter((f) => f.allDay === true);
    expect(allDayEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('the all-day event is "Vermont Open Farm Week"', () => {
    const allDayEvents = fixtures.filter((f) => f.allDay === true);
    expect(allDayEvents.some((f) => f.title === 'Vermont Open Farm Week')).toBe(true);
  });
});

describe('S09 seed-fixtures: tags coverage', () => {
  it("at least one event has tags = ['folk', 'live-music']", () => {
    const match = fixtures.find(
      (f) =>
        f.tags && f.tags.length === 2 && f.tags.includes('folk') && f.tags.includes('live-music'),
    );
    expect(match).toBeDefined();
    expect(match!.title).toBe('Burlington Folk Festival');
  });
});

describe('S09 seed-fixtures: image_url mixed coverage', () => {
  it('some events have image_url', () => {
    const withImage = fixtures.filter((f) => f.imageUrl != null);
    expect(withImage.length).toBeGreaterThanOrEqual(1);
  });

  it('some events do NOT have image_url', () => {
    const withoutImage = fixtures.filter((f) => f.imageUrl == null);
    expect(withoutImage.length).toBeGreaterThanOrEqual(1);
  });
});

describe('S09 seed-fixtures: description / description_html mixed coverage', () => {
  it('some events have description_html', () => {
    const withHtml = fixtures.filter((f) => f.description_html != null);
    expect(withHtml.length).toBeGreaterThanOrEqual(1);
  });

  it('some events have plain description (no HTML)', () => {
    const plainOnly = fixtures.filter((f) => f.description != null && f.description_html == null);
    expect(plainOnly.length).toBeGreaterThanOrEqual(1);
  });
});

describe('S09 seed-fixtures: dedupe_key format (EC-6)', () => {
  it('every row has a dedupe_key', () => {
    for (const row of rows) {
      expect(row.dedupe_key).toBeTruthy();
    }
  });

  it('every dedupe_key follows slug|date|venue format', () => {
    const pattern = /^[a-z0-9-]+\|\d{4}-\d{2}-\d{2}\|[a-z0-9-]*$/;
    for (const row of rows) {
      expect(row.dedupe_key).toMatch(pattern);
    }
  });

  it('dedupe_key uses the correct date from startsAtUtc in the event timezone', () => {
    // Verify the folk fest: 2025-08-15T17:00 EDT -> UTC 21:00 -> local date still 2025-08-15
    const folkFest = fixtures.find((f) => f.slug === 'folk-fest-waterfront')!;
    const startsAtUtc = toUtc(folkFest.localTime, TZID);
    const expectedDate = formatLocal(startsAtUtc, TZID, 'yyyy-MM-dd');
    const dk = dedupeKey(folkFest.title, startsAtUtc, TZID, folkFest.venueName ?? null);
    expect(dk).toContain(`|${expectedDate}|`);
    expect(expectedDate).toBe('2025-08-15');
  });
});

describe('S09 seed-fixtures: deterministic UUIDs (UUIDv5)', () => {
  it('every row has a valid UUID', () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    for (const row of rows) {
      expect(row.id).toMatch(uuidPattern);
    }
  });

  it('UUIDs are deterministic (same input produces same output)', () => {
    const id1 = uuidv5('vermont-events-fixture:folk-fest-waterfront');
    const id2 = uuidv5('vermont-events-fixture:folk-fest-waterfront');
    expect(id1).toBe(id2);
  });

  it('different slugs produce different UUIDs', () => {
    const id1 = uuidv5('vermont-events-fixture:folk-fest-waterfront');
    const id2 = uuidv5('vermont-events-fixture:shelburne-museum-art-show');
    expect(id1).not.toBe(id2);
  });

  it('all fixture UUIDs are unique', () => {
    const ids = rows.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('S09 seed-fixtures: row mandatory fields', () => {
  for (const row of rows) {
    describe(`fixture "${row.title}"`, () => {
      it('has title', () => {
        expect(row.title).toBeTruthy();
      });

      it('has starts_at_utc as a Date', () => {
        expect(row.starts_at_utc).toBeInstanceOf(Date);
      });

      it('has tzid set to America/New_York', () => {
        expect(row.tzid).toBe('America/New_York');
      });

      it('has status = published', () => {
        expect(row.status).toBe('published');
      });

      it('has published_at as a Date', () => {
        expect(row.published_at).toBeInstanceOf(Date);
      });

      it('has dedupe_key as a non-empty string', () => {
        expect(typeof row.dedupe_key).toBe('string');
        expect(row.dedupe_key.length).toBeGreaterThan(0);
      });

      it('has source_id = null (no source for fixtures)', () => {
        expect(row.source_id).toBeNull();
      });
    });
  }
});

describe('S09 seed-fixtures: onConflictDoNothing in source code', () => {
  it('script source contains onConflictDoNothing call', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../scripts/seed-fixtures.ts'), 'utf-8');
    expect(src).toContain('.onConflictDoNothing(');
  });

  it('onConflictDoNothing targets events.id', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../scripts/seed-fixtures.ts'), 'utf-8');
    expect(src).toContain('target: events.id');
  });
});

describe('S09 seed-fixtures: package.json has seed:fixtures script', () => {
  it('package.json contains seed:fixtures script', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.scripts['seed:fixtures']).toBeDefined();
  });

  it('seed:fixtures uses tsx to run the script', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.scripts['seed:fixtures']).toBe('tsx scripts/seed-fixtures.ts');
  });

  it('tsx is in devDependencies', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.devDependencies['tsx']).toBeDefined();
  });
});

describe('S09 seed-fixtures: all rows have ends_at_utc >= starts_at_utc or null', () => {
  for (const row of rows) {
    it(`"${row.title}" ends_at_utc >= starts_at_utc or null`, () => {
      if (row.ends_at_utc != null) {
        expect(row.ends_at_utc.getTime()).toBeGreaterThanOrEqual(row.starts_at_utc.getTime());
      } else {
        expect(row.ends_at_utc).toBeNull();
      }
    });
  }
});

describe('S09 seed-fixtures: all slugs are unique', () => {
  it('fixture slugs are all distinct', () => {
    const slugs = fixtures.map((f) => f.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);
  });
});

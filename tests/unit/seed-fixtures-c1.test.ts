/**
 * tests/unit/seed-fixtures-c1.test.ts
 *
 * Additional coverage tests for S09 seed-fixtures (coverage-c1).
 * Tests slugify, uuidv5 RFC 4122 compliance, dedupeKey edge cases,
 * all-day event handling, fixture data validation, and optional field defaults.
 */

import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { toUtc, formatLocal, DEFAULT_TZ } from '@/lib/tz';

// ---------------------------------------------------------------------------
// Re-implement helpers from seed-fixtures.ts so we can test them
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
// Fixture data (mirrors seed-fixtures.ts for static analysis)
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
    slug: 'vt-craft-fair-swap',
    title: 'Vermont Community Craft & Swap Day',
    description:
      'Bring your gently used items to swap, plus local crafters selling handmade goods. Multiple locations statewide.',
    localTime: '2025-05-17T10:00:00',
    endLocalTime: '2025-05-17T15:00:00',
    region: 'statewide',
    category: 'other',
  },
];

// Compute rows the same way the script does
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

describe('S09 coverage-c1: slugify unit tests', () => {
  it('converts uppercase to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces non-alphanumeric characters with hyphens', () => {
    expect(slugify('foo & bar + baz')).toBe('foo-bar-baz');
  });

  it('collapses consecutive non-alphanumeric chars into a single hyphen', () => {
    expect(slugify('foo---bar___baz')).toBe('foo-bar-baz');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
    expect(slugify('!!!test!!!')).toBe('test');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('returns empty string for input with only special characters', () => {
    expect(slugify('!@#$%^&*()')).toBe('');
  });

  it('handles numeric strings', () => {
    expect(slugify('2025')).toBe('2025');
  });

  it('handles titles with periods and punctuation', () => {
    expect(slugify('St. Johnsbury Town Meeting Day')).toBe('st-johnsbury-town-meeting-day');
  });

  it('handles ampersand in titles', () => {
    expect(slugify('Burlington Mac & Cheese Festival')).toBe('burlington-mac-cheese-festival');
  });

  it('handles colon in titles', () => {
    expect(slugify('Guided Hike: Burke Mountain Summit')).toBe('guided-hike-burke-mountain-summit');
  });
});

describe('S09 coverage-c1: uuidv5 RFC 4122 compliance', () => {
  it('produces a UUID with version nibble = 5', () => {
    const id = uuidv5('test-input');
    // Format: xxxxxxxx-xxxx-Vxxx-xxxx-xxxxxxxxxxxx where V = 5
    expect(id[14]).toBe('5');
  });

  it('produces a UUID with correct variant bits (10xx)', () => {
    const id = uuidv5('test-input');
    // Position 19 should be 8, 9, a, or b
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('produces valid 36-character UUID with hyphens at correct positions', () => {
    const id = uuidv5('any-input');
    expect(id.length).toBe(36);
    expect(id[8]).toBe('-');
    expect(id[13]).toBe('-');
    expect(id[18]).toBe('-');
    expect(id[23]).toBe('-');
  });

  it('known test vector: DNS namespace + "www.example.com" produces expected UUID', () => {
    // RFC 4122 Appendix B: UUIDv5(DNS, "www.example.com") =
    // 2ed6657d-e927-568b-95e1-2665a8aea6a2
    const expected = '2ed6657d-e927-568b-95e1-2665a8aea6a2';
    const result = uuidv5('www.example.com');
    expect(result).toBe(expected);
  });

  it('empty name string still produces a valid UUIDv5', () => {
    const id = uuidv5('');
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(id).toMatch(uuidPattern);
  });
});

describe('S09 coverage-c1: dedupeKey with null venue', () => {
  it('produces trailing empty segment when venueName is null', () => {
    const startsAtUtc = toUtc('2025-07-04T10:00:00', TZID);
    const dk = dedupeKey('Test Event', startsAtUtc, TZID, null);
    expect(dk).toMatch(/\|$/);
    expect(dk).toBe('test-event|2025-07-04|');
  });

  it('produces trailing empty segment when venueName is empty string', () => {
    const startsAtUtc = toUtc('2025-07-04T10:00:00', TZID);
    const dk = dedupeKey('Test Event', startsAtUtc, TZID, '');
    expect(dk).toBe('test-event|2025-07-04|');
  });

  it('includes slugified venue name when provided', () => {
    const startsAtUtc = toUtc('2025-07-04T10:00:00', TZID);
    const dk = dedupeKey('Test Event', startsAtUtc, TZID, 'City Hall');
    expect(dk).toBe('test-event|2025-07-04|city-hall');
  });

  it('handles venue with special characters', () => {
    const startsAtUtc = toUtc('2025-07-04T10:00:00', TZID);
    const dk = dedupeKey('Test Event', startsAtUtc, TZID, 'ECHO Leahy Center');
    expect(dk).toBe('test-event|2025-07-04|echo-leahy-center');
  });
});

describe('S09 coverage-c1: all-day event time handling', () => {
  it('all-day event uses midnight local time for starts_at_utc', () => {
    const allDayFixture = fixtures.find((f) => f.allDay === true)!;
    expect(allDayFixture).toBeDefined();

    const expectedUtc = toUtc(`${allDayFixture.localTime.slice(0, 10)}T00:00:00`, TZID);
    const row = rows.find((r) => r.title === allDayFixture.title)!;
    expect(row.starts_at_utc.getTime()).toBe(expectedUtc.getTime());
  });

  it('all-day event has no ends_at_utc (null)', () => {
    const allDayFixture = fixtures.find((f) => f.allDay === true)!;
    const row = rows.find((r) => r.title === allDayFixture.title)!;
    expect(row.ends_at_utc).toBeNull();
  });

  it('all-day event has all_day = true in row', () => {
    const row = rows.find((r) => r.title === 'Vermont Open Farm Week')!;
    expect(row.all_day).toBe(true);
  });

  it('non-all-day events have all_day = false', () => {
    const nonAllDay = rows.filter((r) => r.title !== 'Vermont Open Farm Week');
    for (const row of nonAllDay) {
      expect(row.all_day).toBe(false);
    }
  });
});

describe('S09 coverage-c1: dedupe_key uniqueness across fixtures', () => {
  it('all fixture dedupe_keys are distinct', () => {
    const keys = rows.map((r) => r.dedupe_key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });
});

describe('S09 coverage-c1: localTime format validation', () => {
  it('every fixture has a valid ISO local time format', () => {
    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
    for (const f of fixtures) {
      expect(f.localTime).toMatch(isoPattern);
      if (f.endLocalTime) {
        expect(f.endLocalTime).toMatch(isoPattern);
      }
    }
  });
});

describe('S09 coverage-c1: fixture data structural validation', () => {
  it('every fixture has a non-empty slug', () => {
    for (const f of fixtures) {
      expect(f.slug.length).toBeGreaterThan(0);
    }
  });

  it('every fixture has a non-empty title', () => {
    for (const f of fixtures) {
      expect(f.title.length).toBeGreaterThan(0);
    }
  });

  it('every fixture has either description or description_html (at least one)', () => {
    for (const f of fixtures) {
      const hasDesc = f.description != null || f.description_html != null;
      expect(hasDesc).toBe(true);
    }
  });

  it('every fixture has a valid region value', () => {
    const validRegions = new Set([
      'burlington_area',
      'champlain_valley',
      'central_vt',
      'northeast_kingdom',
      'southern_vt',
      'statewide',
    ]);
    for (const f of fixtures) {
      expect(validRegions.has(f.region)).toBe(true);
    }
  });

  it('every fixture has a valid category value', () => {
    const validCategories = new Set([
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
    ]);
    for (const f of fixtures) {
      expect(validCategories.has(f.category)).toBe(true);
    }
  });
});

describe('S09 coverage-c1: row defaults for optional fields', () => {
  it('rows without description set description to null', () => {
    const row = rows.find((r) => r.title === 'Summer Art Show at Shelburne Museum')!;
    expect(row.description).toBeNull();
    expect(row.description_html).not.toBeNull();
  });

  it('rows without imageUrl set image_url to null', () => {
    const row = rows.find((r) => r.title === 'Montpelier Summer Beer Garden')!;
    expect(row.image_url).toBeNull();
  });

  it('rows without tags get empty array', () => {
    const row = rows.find((r) => r.title === 'Montpelier Summer Beer Garden')!;
    expect(row.tags).toEqual([]);
  });

  it('rows without url get null', () => {
    const row = rows.find((r) => r.title === 'Montpelier Summer Beer Garden')!;
    expect(row.url).toBeNull();
  });

  it('rows without venueAddress get null', () => {
    const row = rows.find((r) => r.title === 'Vermont Open Farm Week')!;
    expect(row.venue_name).toBeNull();
    expect(row.venue_address).toBeNull();
  });
});

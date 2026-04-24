import { formatInTimeZone } from 'date-fns-tz';
import { describe, expect, it } from 'vitest';

import {
  computeDedupeKey,
  computeFuzzyScore,
  normalizeForScoring,
  slugify,
} from '@/lib/ingest/dedupe';
import type { EventRowCandidate } from '@/lib/ingest/normalize';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function fakeCandidate(overrides: Partial<EventRowCandidate> = {}): EventRowCandidate {
  return {
    source_id: '00000000-0000-0000-0000-000000000001',
    external_id: 'ext-1',
    title: 'Vermont Jazz Festival',
    description: null,
    description_html: null,
    starts_at_utc: new Date('2025-07-15T18:00:00Z'), // 2 PM ET (EDT)
    ends_at_utc: null,
    tzid: 'America/New_York',
    all_day: false,
    venue_name: 'Burlington Town Center',
    venue_address: null,
    region: 'statewide',
    lat: null,
    lng: null,
    url: null,
    image_url: null,
    category: 'other',
    tags: [],
    dedupe_key: '',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  slugify tests                                                       */
/* ------------------------------------------------------------------ */

describe('slugify', () => {
  it('lowercases input', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips diacritics (NFD normalize)', () => {
    expect(slugify('Caf\u00e9 R\u00e9sum\u00e9')).toBe('cafe-resume');
  });

  it('replaces non-alnum characters with hyphens', () => {
    expect(slugify('hello@world! foo')).toBe('hello-world-foo');
  });

  it('collapses consecutive hyphens', () => {
    expect(slugify('hello---world')).toBe('hello-world');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles string with only special characters', () => {
    expect(slugify('!!!')).toBe('');
  });

  it('preserves numbers', () => {
    expect(slugify('Event 2025')).toBe('event-2025');
  });

  it('handles German umlauts', () => {
    expect(slugify('M\u00fcnchen \u00d6ster')).toBe('munchen-oster');
  });
});

/* ------------------------------------------------------------------ */
/*  computeDedupeKey tests                                              */
/* ------------------------------------------------------------------ */

describe('computeDedupeKey', () => {
  it('formats as slug|date|venue', () => {
    const candidate = fakeCandidate();
    const key = computeDedupeKey(candidate);
    const parts = key.split('|');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('vermont-jazz-festival');
    expect(parts[1]).toBe('2025-07-15');
    expect(parts[2]).toBe('burlington-town-center');
  });

  it('uses empty string for venue when null', () => {
    const candidate = fakeCandidate({ venue_name: null });
    const key = computeDedupeKey(candidate);
    const parts = key.split('|');
    expect(parts[2]).toBe('');
  });

  it('computes date in source tzid, not UTC', () => {
    const candidate = fakeCandidate({
      starts_at_utc: new Date('2025-07-16T03:00:00Z'),
      tzid: 'America/New_York',
    });
    const key = computeDedupeKey(candidate);
    const parts = key.split('|');
    expect(parts[1]).toBe('2025-07-15');
  });

  it('computes date correctly for UTC timezone', () => {
    const candidate = fakeCandidate({
      starts_at_utc: new Date('2025-07-16T03:00:00Z'),
      tzid: 'UTC',
    });
    const key = computeDedupeKey(candidate);
    const parts = key.split('|');
    expect(parts[1]).toBe('2025-07-16');
  });

  it('produces consistent key for identical inputs', () => {
    const candidate = fakeCandidate();
    const key1 = computeDedupeKey(candidate);
    const key2 = computeDedupeKey(candidate);
    expect(key1).toBe(key2);
  });
});

/* ------------------------------------------------------------------ */
/*  normalizeForScoring tests                                           */
/* ------------------------------------------------------------------ */

describe('normalizeForScoring', () => {
  it('lowercases text', () => {
    expect(normalizeForScoring('Hello World')).toBe('hello world');
  });

  it('strips punctuation', () => {
    expect(normalizeForScoring('Hello, World!')).toBe('hello world');
  });

  it('collapses whitespace', () => {
    expect(normalizeForScoring('hello   world')).toBe('hello world');
  });

  it('trims whitespace', () => {
    expect(normalizeForScoring('  hello  ')).toBe('hello');
  });
});

/* ------------------------------------------------------------------ */
/*  computeFuzzyScore tests                                             */
/* ------------------------------------------------------------------ */

describe('computeFuzzyScore', () => {
  const baseTime = new Date('2025-07-15T18:00:00Z');

  /* ---- Five spec scenarios (section 16.4) ---- */

  it('exact title + same date + same venue -> score = 1.0 (exact-key match)', () => {
    const { score, titleScore, venueScore, timeScore } = computeFuzzyScore(
      'Hula Lakeside',
      'Burlington Town Center',
      baseTime,
      'Hula Lakeside',
      'Burlington Town Center',
      baseTime,
    );

    expect(titleScore).toBe(1.0);
    expect(venueScore).toBe(1.0);
    expect(timeScore).toBe(1.0);
    expect(score).toBe(1.0);
  });

  it('same event different venue spelling ("Hula Lakeside" vs "Hula") -> fuzzy auto', () => {
    const { score, titleScore, venueScore } = computeFuzzyScore(
      'Hula Lakeside',
      'Lakeside Pavilion',
      baseTime,
      'Hula',
      'Lakeside Pav.',
      baseTime,
    );

    // token_set_ratio("hula lakeside", "hula") = 100 (subset match)
    expect(titleScore).toBe(1.0);
    // Venues are similar ("lakeside-pavilion" vs "lakeside-pav")
    expect(venueScore).toBeGreaterThan(0.5);
    // Total should be >= 0.92 (auto threshold)
    expect(score).toBeGreaterThanOrEqual(0.92);
  });

  it('different events same title same date ("Open Mic Night" two venues) -> fuzzy review', () => {
    const { score, titleScore, venueScore } = computeFuzzyScore(
      'Open Mic Night',
      'Radio Bean',
      baseTime,
      'Open Mic Night',
      'Nectars',
      baseTime,
    );

    // Same title -> 1.0
    expect(titleScore).toBe(1.0);
    // Very different venues -> low score
    expect(venueScore).toBeLessThan(0.5);
    // Total should be >= 0.75 (review) but < 0.92 (auto)
    expect(score).toBeGreaterThanOrEqual(0.75);
    expect(score).toBeLessThan(0.92);
  });

  it('recurring same-title "Open Mic Wednesdays" across two sources, same venue -> fuzzy auto', () => {
    const { score } = computeFuzzyScore(
      'Open Mic Wednesdays',
      'Radio Bean',
      baseTime,
      'Open Mic Wednesdays',
      'Radio Bean',
      baseTime,
    );

    // Exact match on title and venue -> auto
    expect(score).toBeGreaterThanOrEqual(0.92);
  });

  it('different events same date same venue -> no match', () => {
    const { score } = computeFuzzyScore(
      'Jazz Night',
      'Burlington Town Center',
      baseTime,
      'Salsa Dancing',
      'Burlington Town Center',
      baseTime,
    );

    // Very different titles -> below review threshold
    expect(score).toBeLessThan(0.75);
  });

  /* ---- Time gating tests ---- */

  it('+61 minutes -> timeScore = 0 (not considered due to time window)', () => {
    const future = new Date(baseTime.getTime() + 61 * 60_000);
    const { timeScore } = computeFuzzyScore(
      'Hula Lakeside',
      'Burlington Town Center',
      baseTime,
      'Hula Lakeside',
      'Burlington Town Center',
      future,
    );

    // timeScore = 1 - min(1, 61/60) = 1 - 1 = 0
    expect(timeScore).toBe(0);
  });

  it('+30 minutes -> timeScore = 0.5', () => {
    const future = new Date(baseTime.getTime() + 30 * 60_000);
    const { timeScore } = computeFuzzyScore('Hula', null, baseTime, 'Hula', null, future);

    expect(timeScore).toBeCloseTo(0.5, 5);
  });

  /* ---- DST boundary test ---- */

  it('same calendar day across DST boundary still matches', () => {
    // DST fall-back: Nov 2, 2025 at 2:00 AM clocks go back to 1:00 AM EST
    // Event A: 2025-11-02T05:30:00Z = 1:30 AM EDT (before fall-back)
    // Event B: 2025-11-02T06:30:00Z = 1:30 AM EST (after fall-back)
    // Both are on November 2 in America/New_York
    const eventA = new Date('2025-11-02T05:30:00Z'); // 1:30 AM EDT
    const eventB = new Date('2025-11-02T06:30:00Z'); // 1:30 AM EST

    const { score, timeScore } = computeFuzzyScore(
      'Late Night Jam',
      'Radio Bean',
      eventA,
      'Late Night Jam',
      'Radio Bean',
      eventB,
    );

    // 60 minutes apart, timeScore = 0
    expect(timeScore).toBe(0);
    // But the fuzzy score is still computed (title + venue contribute)
    // 0.55 * 1.0 + 0.30 * 1.0 + 0.15 * 0.0 = 0.85
    expect(score).toBeCloseTo(0.85, 5);

    // Both dates resolve to the same calendar day in America/New_York
    const dayA = formatInTimeZone(eventA, 'America/New_York', 'yyyy-MM-dd');
    const dayB = formatInTimeZone(eventB, 'America/New_York', 'yyyy-MM-dd');
    expect(dayA).toBe('2025-11-02');
    expect(dayB).toBe('2025-11-02');
  });

  /* ---- Venue null handling ---- */

  it('both venues null -> venueScore = 0.5 (neutral)', () => {
    const { venueScore } = computeFuzzyScore('Hula', null, baseTime, 'Hula', null, baseTime);

    expect(venueScore).toBe(0.5);
  });

  it('one venue null -> venueScore = 0.5 (neutral)', () => {
    const { venueScore } = computeFuzzyScore(
      'Hula',
      'Burlington Town Center',
      baseTime,
      'Hula',
      null,
      baseTime,
    );

    expect(venueScore).toBe(0.5);
  });

  /* ---- Weight validation ---- */

  it('weights sum to 1.0 (all subscores = 1.0 -> total = 1.0)', () => {
    const { score } = computeFuzzyScore('Test', 'Venue', baseTime, 'Test', 'Venue', baseTime);

    expect(score).toBe(1.0);
  });
});

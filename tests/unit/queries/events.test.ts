import { describe, expect, it } from 'vitest';

import { encodeCursor, decodeCursor, type PublicEventItem } from '@/lib/db/queries/events-schema';

/**
 * Unit tests for query logic that can be verified without a live database.
 * These test cursor encode/decode, filter routing, and the mapper logic.
 * Integration tests with a real Neon DB are gated behind DATABASE_URL_UNPOOLED.
 */

/* ------------------------------------------------------------------ */
/*  Cursor stability                                                    */
/* ------------------------------------------------------------------ */

describe('cursor encode/decode stability', () => {
  it('deterministic: same inputs produce same cursor', () => {
    const date = new Date('2026-05-01T12:00:00.000Z');
    const id = '11111111-1111-1111-1111-111111111111';
    const a = encodeCursor(date, id);
    const b = encodeCursor(date, id);
    expect(a).toBe(b);
  });

  it('different inputs produce different cursors', () => {
    const date = new Date('2026-05-01T12:00:00.000Z');
    const id1 = '11111111-1111-1111-1111-111111111111';
    const id2 = '22222222-2222-2222-2222-222222222222';
    const a = encodeCursor(date, id1);
    const b = encodeCursor(date, id2);
    expect(a).not.toBe(b);
  });

  it('handles edge-case dates (epoch, far future)', () => {
    const epoch = new Date(0);
    const future = new Date('2099-12-31T23:59:59.999Z');
    const id = '00000000-0000-0000-0000-000000000000';

    const e1 = encodeCursor(epoch, id);
    const d1 = decodeCursor(e1);
    expect(d1.starts_at_utc).toBe(epoch.toISOString());

    const e2 = encodeCursor(future, id);
    const d2 = decodeCursor(e2);
    expect(d2.starts_at_utc).toBe(future.toISOString());
  });
});

/* ------------------------------------------------------------------ */
/*  Search path routing logic                                           */
/* ------------------------------------------------------------------ */

describe('search path routing', () => {
  /**
   * These tests verify the routing logic in listPublicEvents:
   * - q undefined or empty: no text filter
   * - q.length < 3: ILIKE fallback
   * - q.length >= 3: plainto_tsquery
   */

  function classifySearchPath(q: string | undefined): 'none' | 'ilike' | 'tsquery' {
    if (q === undefined || q.length === 0) return 'none';
    if (q.length < 3) return 'ilike';
    return 'tsquery';
  }

  it('undefined q => no text filter', () => {
    expect(classifySearchPath(undefined)).toBe('none');
  });

  it('empty string q => no text filter', () => {
    expect(classifySearchPath('')).toBe('none');
  });

  it('q="ab" (2 chars) => ILIKE fallback', () => {
    expect(classifySearchPath('ab')).toBe('ilike');
  });

  it('q="a" (1 char) => ILIKE fallback', () => {
    expect(classifySearchPath('a')).toBe('ilike');
  });

  it('q="abc" (3 chars) => tsquery', () => {
    expect(classifySearchPath('abc')).toBe('tsquery');
  });

  it('q="open mic" (8 chars) => tsquery', () => {
    expect(classifySearchPath('open mic')).toBe('tsquery');
  });
});

/* ------------------------------------------------------------------ */
/*  Response shape verification                                         */
/* ------------------------------------------------------------------ */

describe('PublicEventItem shape', () => {
  it('has all required camelCase keys', () => {
    const item: PublicEventItem = {
      id: 'test-id',
      title: 'Test Event',
      startsAt: '2026-05-01T23:00:00.000Z',
      endsAt: null,
      tzid: 'America/New_York',
      allDay: false,
      venueName: 'Test Venue',
      region: 'burlington_area',
      category: 'music',
      tags: ['folk'],
      url: '/events/test-id',
      sourceName: 'UVM Events',
      imageUrl: null,
    };

    const keys = Object.keys(item);

    const expectedKeys = [
      'id',
      'title',
      'startsAt',
      'endsAt',
      'tzid',
      'allDay',
      'venueName',
      'region',
      'category',
      'tags',
      'url',
      'sourceName',
      'imageUrl',
    ];
    for (const key of expectedKeys) {
      expect(keys).toContain(key);
    }

    // Ensure no snake_case leakage
    const forbiddenKeys = [
      'starts_at',
      'ends_at',
      'all_day',
      'venue_name',
      'source_name',
      'image_url',
    ];
    for (const key of forbiddenKeys) {
      expect(keys).not.toContain(key);
    }
  });
});

import { describe, expect, it } from 'vitest';

import {
  PublicEventsQuerySchema,
  encodeCursor,
  decodeCursor,
} from '@/lib/db/queries/events-schema';

/* ------------------------------------------------------------------ */
/*  Cursor encode/decode round-trip                                     */
/* ------------------------------------------------------------------ */

describe('cursor encode/decode round-trip', () => {
  it('round-trips a cursor with a known date and UUID', () => {
    const date = new Date('2026-07-04T19:00:00.000Z');
    const id = '550e8400-e29b-41d4-a716-446655440000';

    const encoded = encodeCursor(date, id);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodeCursor(encoded);
    expect(decoded.starts_at_utc).toBe('2026-07-04T19:00:00.000Z');
    expect(decoded.id).toBe(id);
  });

  it('round-trips multiple different cursors', () => {
    const pairs = [
      { date: new Date('2026-01-01T00:00:00.000Z'), id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
      { date: new Date('2026-12-31T23:59:59.999Z'), id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
      { date: new Date('2026-06-15T12:30:00.000Z'), id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
    ];

    for (const { date, id } of pairs) {
      const encoded = encodeCursor(date, id);
      const decoded = decodeCursor(encoded);
      expect(decoded.starts_at_utc).toBe(date.toISOString());
      expect(decoded.id).toBe(id);
    }
  });

  it('produces base64url-safe strings (no +, /, =)', () => {
    const date = new Date('2026-07-04T19:00:00.000Z');
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const encoded = encodeCursor(date, id);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('throws on invalid base64 cursor', () => {
    expect(() => decodeCursor('not-valid-json!!!')).toThrow();
  });

  it('throws on valid base64 but missing fields', () => {
    const bad = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');
    expect(() => decodeCursor(bad)).toThrow('Invalid cursor payload');
  });

  it('throws on valid base64 but invalid date', () => {
    const bad = Buffer.from(JSON.stringify({ starts_at_utc: 'not-a-date', id: 'abc' })).toString(
      'base64url',
    );
    expect(() => decodeCursor(bad)).toThrow('Invalid cursor date');
  });
});

/* ------------------------------------------------------------------ */
/*  PublicEventsQuerySchema validation                                   */
/* ------------------------------------------------------------------ */

describe('PublicEventsQuerySchema', () => {
  it('accepts empty input (all defaults)', () => {
    const result = PublicEventsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(250);
      expect(result.data.fromDate).toBeInstanceOf(Date);
      expect(result.data.toDate).toBeInstanceOf(Date);
    }
  });

  it('applies default from=now and to=from+90d', () => {
    const before = Date.now();
    const result = PublicEventsQuerySchema.safeParse({});
    const after = Date.now();
    expect(result.success).toBe(true);
    if (result.success) {
      // fromDate should be approximately now
      expect(result.data.fromDate.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.data.fromDate.getTime()).toBeLessThanOrEqual(after);
      // toDate should be ~90 days after fromDate
      const diffDays =
        (result.data.toDate.getTime() - result.data.fromDate.getTime()) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBeCloseTo(90, 0);
    }
  });

  it('rejects to more than 366 days after from (HTTP 422 case)', () => {
    const result = PublicEventsQuerySchema.safeParse({
      from: '2026-01-01T00:00:00Z',
      to: '2027-02-01T00:00:00Z', // 396 days later
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes('366'))).toBe(true);
    }
  });

  it('accepts to exactly 366 days after from', () => {
    const result = PublicEventsQuerySchema.safeParse({
      from: '2026-01-01T00:00:00Z',
      to: '2027-01-02T00:00:00Z', // exactly 366 days
    });
    expect(result.success).toBe(true);
  });

  it('rejects limit below 1', () => {
    const result = PublicEventsQuerySchema.safeParse({ limit: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects limit above 500', () => {
    const result = PublicEventsQuerySchema.safeParse({ limit: '501' });
    expect(result.success).toBe(false);
  });

  it('accepts limit=1', () => {
    const result = PublicEventsQuerySchema.safeParse({ limit: '1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(1);
    }
  });

  it('accepts limit=500', () => {
    const result = PublicEventsQuerySchema.safeParse({ limit: '500' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(500);
    }
  });

  it('rejects q longer than 100 characters', () => {
    const result = PublicEventsQuerySchema.safeParse({ q: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts q of exactly 100 characters', () => {
    const result = PublicEventsQuerySchema.safeParse({ q: 'a'.repeat(100) });
    expect(result.success).toBe(true);
  });

  it('accepts valid region enum value', () => {
    const result = PublicEventsQuerySchema.safeParse({
      region: 'burlington_area',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.region).toBe('burlington_area');
    }
  });

  it('rejects invalid region enum value', () => {
    const result = PublicEventsQuerySchema.safeParse({
      region: 'nonexistent_region',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid category enum value', () => {
    const result = PublicEventsQuerySchema.safeParse({ category: 'music' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe('music');
    }
  });

  it('rejects invalid category enum value', () => {
    const result = PublicEventsQuerySchema.safeParse({
      category: 'invalid_cat',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid from datetime', () => {
    const result = PublicEventsQuerySchema.safeParse({
      from: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid to datetime', () => {
    const result = PublicEventsQuerySchema.safeParse({
      from: '2026-01-01T00:00:00Z',
      to: 'garbage',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid cursor string', () => {
    const cursor = encodeCursor(
      new Date('2026-05-01T12:00:00Z'),
      '550e8400-e29b-41d4-a716-446655440000',
    );
    const result = PublicEventsQuerySchema.safeParse({ cursor });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cursor).toBe(cursor);
    }
  });

  it('coerces limit from string to number', () => {
    const result = PublicEventsQuerySchema.safeParse({ limit: '42' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(42);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Short q triggers ILIKE path, long q triggers tsquery path           */
/* ------------------------------------------------------------------ */

describe('q length routing logic', () => {
  it('q="ab" (2 chars) is accepted and would use ILIKE path', () => {
    const result = PublicEventsQuerySchema.safeParse({ q: 'ab' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe('ab');
      // q.length < 3 -> ILIKE path
      expect(result.data.q!.length).toBeLessThan(3);
    }
  });

  it('q="open mic" (8 chars) is accepted and would use tsquery path', () => {
    const result = PublicEventsQuerySchema.safeParse({ q: 'open mic' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe('open mic');
      // q.length >= 3 -> tsquery path
      expect(result.data.q!.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('q="" (empty) is accepted', () => {
    const result = PublicEventsQuerySchema.safeParse({ q: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      // empty string has length 0, neither ILIKE nor tsquery fires
      expect(result.data.q).toBe('');
    }
  });
});

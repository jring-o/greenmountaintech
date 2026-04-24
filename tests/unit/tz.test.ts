import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TZ,
  TimeZoneGapError,
  toUtc,
  toZoned,
  formatLocal,
  isoUtc,
  startOfDayInTz,
  endOfDayInTz,
  addMonthsTz,
} from '@/lib/tz';

const ET = DEFAULT_TZ; // 'America/New_York'

// ---------------------------------------------------------------------------
// (a) Round-trip toUtc -> toZoned -> formatLocal for summer + winter ET times
// ---------------------------------------------------------------------------

describe('round-trip toUtc -> toZoned -> formatLocal', () => {
  it('summer time (EDT): 2026-07-04T19:30:00 ET round-trips correctly', () => {
    const utc = toUtc('2026-07-04T19:30:00', ET);
    // EDT = UTC-4, so 19:30 ET -> 23:30 UTC
    expect(utc.toISOString()).toBe('2026-07-04T23:30:00.000Z');

    const zoned = toZoned(utc, ET);
    expect(zoned.getHours()).toBe(19);
    expect(zoned.getMinutes()).toBe(30);

    const formatted = formatLocal(utc, ET);
    expect(formatted).toContain('7:30 PM');
    expect(formatted).toContain('EDT');
  });

  it('winter time (EST): 2026-01-15T08:00:00 ET round-trips correctly', () => {
    const utc = toUtc('2026-01-15T08:00:00', ET);
    // EST = UTC-5, so 08:00 ET -> 13:00 UTC
    expect(utc.toISOString()).toBe('2026-01-15T13:00:00.000Z');

    const zoned = toZoned(utc, ET);
    expect(zoned.getHours()).toBe(8);
    expect(zoned.getMinutes()).toBe(0);

    const formatted = formatLocal(utc, ET);
    expect(formatted).toContain('8:00 AM');
    expect(formatted).toContain('EST');
  });
});

// ---------------------------------------------------------------------------
// (b) Spring-forward gap throws TimeZoneGapError
// ---------------------------------------------------------------------------

describe('spring-forward gap throws', () => {
  // 2026-03-08 at 2:00 AM ET, clocks spring forward to 3:00 AM.
  // Times 2:00-2:59 do not exist.

  it('2026-03-08T02:30:00 ET throws TimeZoneGapError', () => {
    expect(() => toUtc('2026-03-08T02:30:00', ET)).toThrow(TimeZoneGapError);
  });

  it('2026-03-08T02:00:00 ET throws TimeZoneGapError', () => {
    expect(() => toUtc('2026-03-08T02:00:00', ET)).toThrow(TimeZoneGapError);
  });

  it('2026-03-08T01:30:00 ET does NOT throw (before gap)', () => {
    expect(() => toUtc('2026-03-08T01:30:00', ET)).not.toThrow();
  });

  it('2026-03-08T03:00:00 ET does NOT throw (after gap)', () => {
    expect(() => toUtc('2026-03-08T03:00:00', ET)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// (c) Fall-back overlap returns the EST (later offset) instant
// ---------------------------------------------------------------------------

describe('fall-back overlap prefers EST (later offset)', () => {
  // 2026-11-01 at 2:00 AM EDT, clocks fall back to 1:00 AM EST.
  // 1:30 AM exists twice: once as EDT (UTC-4) and once as EST (UTC-5).
  // Policy: prefer EST (later offset, UTC-5) => 1:30 AM EST = 06:30 UTC.

  it('2026-11-01T01:30:00 ET resolves to EST (06:30 UTC), not EDT (05:30 UTC)', () => {
    const utc = toUtc('2026-11-01T01:30:00', ET);
    // EST interpretation: 01:30 + 5h = 06:30 UTC
    expect(utc.toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });

  it('2026-11-01T01:00:00 ET resolves to EST (06:00 UTC)', () => {
    const utc = toUtc('2026-11-01T01:00:00', ET);
    expect(utc.toISOString()).toBe('2026-11-01T06:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// (d) All-day handling: midnight + 24h = next-day midnight in ET
// ---------------------------------------------------------------------------

describe('all-day handling', () => {
  it('toUtc midnight 2026-06-15 + 24h equals next-day midnight in ET', () => {
    const midnightUtc = toUtc('2026-06-15T00:00:00', ET);
    const nextMidnightUtc = toUtc('2026-06-16T00:00:00', ET);
    const diffMs = nextMidnightUtc.getTime() - midnightUtc.getTime();
    // 24 hours in milliseconds
    expect(diffMs).toBe(24 * 60 * 60 * 1000);
  });

  it('startOfDayInTz and endOfDayInTz span ~24h', () => {
    const utcNoon = toUtc('2026-06-15T12:00:00', ET);
    const sod = startOfDayInTz(utcNoon, ET);
    const eod = endOfDayInTz(utcNoon, ET);

    // Start of day in EDT: 2026-06-15T00:00:00-04:00 = 2026-06-15T04:00:00Z
    expect(sod.toISOString()).toBe('2026-06-15T04:00:00.000Z');

    // End of day in EDT: 2026-06-15T23:59:59.999-04:00 = 2026-06-16T03:59:59.999Z
    expect(eod.toISOString()).toBe('2026-06-16T03:59:59.999Z');
  });
});

// ---------------------------------------------------------------------------
// (e) formatLocal default pattern regex match
// ---------------------------------------------------------------------------

describe('formatLocal default pattern', () => {
  it('produces a string matching the expected pattern', () => {
    const utc = toUtc('2026-05-06T19:30:00', ET);
    const formatted = formatLocal(utc, ET);
    // Expected: "Wed, May 6 · 7:30 PM EDT"
    const pattern = /[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} · \d{1,2}:\d{2} (AM|PM) E[SD]T/;
    expect(formatted).toMatch(pattern);
  });

  it('winter time also matches the pattern', () => {
    const utc = toUtc('2026-12-25T09:00:00', ET);
    const formatted = formatLocal(utc, ET);
    const pattern = /[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} · \d{1,2}:\d{2} (AM|PM) E[SD]T/;
    expect(formatted).toMatch(pattern);
  });
});

// ---------------------------------------------------------------------------
// Supplementary: isoUtc and addMonthsTz
// ---------------------------------------------------------------------------

describe('isoUtc', () => {
  it('returns the ISO string', () => {
    const d = new Date('2026-06-15T12:00:00.000Z');
    expect(isoUtc(d)).toBe('2026-06-15T12:00:00.000Z');
  });
});

describe('addMonthsTz', () => {
  it('adds months preserving wall-clock time', () => {
    const jan = toUtc('2026-01-15T10:00:00', ET);
    const apr = addMonthsTz(jan, 3, ET);
    // Jan is EST (UTC-5), Apr is EDT (UTC-4).
    // 10:00 EST = 15:00 UTC in Jan; 10:00 EDT = 14:00 UTC in Apr.
    const zoned = toZoned(apr, ET);
    expect(zoned.getHours()).toBe(10);
    expect(zoned.getMinutes()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (f) Error path: invalid ISO string input
// ---------------------------------------------------------------------------

describe('toUtc invalid input', () => {
  it('throws Error for malformed ISO string', () => {
    expect(() => toUtc('not-a-date', ET)).toThrow('Invalid local ISO string: "not-a-date"');
  });

  it('throws Error for empty string', () => {
    expect(() => toUtc('', ET)).toThrow('Invalid local ISO string');
  });

  it('throws Error for partial date without time', () => {
    expect(() => toUtc('2026-06-15', ET)).toThrow('Invalid local ISO string');
  });
});

// ---------------------------------------------------------------------------
// (g) toUtc default timezone parameter
// ---------------------------------------------------------------------------

describe('toUtc default timezone', () => {
  it('uses America/New_York when tzid is omitted', () => {
    // Summer time: 12:00 ET (EDT, UTC-4) => 16:00 UTC
    const utc = toUtc('2026-07-04T12:00:00');
    expect(utc.toISOString()).toBe('2026-07-04T16:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// (h) formatLocal with custom pattern
// ---------------------------------------------------------------------------

describe('formatLocal custom pattern', () => {
  it('formats with a custom pattern', () => {
    const utc = toUtc('2026-07-04T15:00:00', ET);
    const formatted = formatLocal(utc, ET, 'yyyy-MM-dd HH:mm');
    expect(formatted).toBe('2026-07-04 15:00');
  });
});

// ---------------------------------------------------------------------------
// (i) addMonthsTz subtracting months
// ---------------------------------------------------------------------------

describe('addMonthsTz negative months', () => {
  it('subtracts months preserving wall-clock time', () => {
    const jul = toUtc('2026-07-15T10:00:00', ET);
    const apr = addMonthsTz(jul, -3, ET);
    const zoned = toZoned(apr, ET);
    expect(zoned.getHours()).toBe(10);
    expect(zoned.getMinutes()).toBe(0);
    // April is also EDT, so same offset
    expect(apr.toISOString()).toBe('2026-04-15T14:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// (j) Day boundaries during DST transitions
// ---------------------------------------------------------------------------

describe('day boundaries during DST transitions', () => {
  it('startOfDayInTz on spring-forward day spans 23h', () => {
    // 2026-03-08: clocks spring forward at 2:00 AM, so the day is 23 hours
    const utcNoon = toUtc('2026-03-08T12:00:00', ET);
    const sod = startOfDayInTz(utcNoon, ET);
    const eod = endOfDayInTz(utcNoon, ET);
    const diffMs = eod.getTime() - sod.getTime();
    // 23 hours minus 1ms (since eod is 23:59:59.999)
    const hours = diffMs / 3_600_000;
    expect(hours).toBeCloseTo(23, 0);
  });

  it('startOfDayInTz on fall-back day spans 25h', () => {
    // 2026-11-01: clocks fall back at 2:00 AM, so the day is 25 hours
    const utcNoon = toUtc('2026-11-01T12:00:00', ET);
    const sod = startOfDayInTz(utcNoon, ET);
    const eod = endOfDayInTz(utcNoon, ET);
    const diffMs = eod.getTime() - sod.getTime();
    const hours = diffMs / 3_600_000;
    expect(hours).toBeCloseTo(25, 0);
  });
});

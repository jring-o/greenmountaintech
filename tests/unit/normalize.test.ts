import { describe, expect, it, vi } from 'vitest';

import type { AdapterEvent, Logger } from '@/lib/adapters/types';
import type { SourceRow } from '@/lib/db/schema';
import { normalize, NormalizeError } from '@/lib/ingest/normalize';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function fakeSource(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Source',
    slug: 'test-source',
    kind: 'whitelist',
    adapter_type: 'ical',
    adapter_key: 'generic',
    url: 'https://example.com/cal.ics',
    adapter_config: {},
    trust_level: 'review',
    is_active: true,
    contact_url: null,
    rate_limit_per_min: 30,
    robots_respect: true,
    last_run_at: null,
    last_run_status: null,
    consecutive_failures: 0,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function fakeLog(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => fakeLog(),
  };
}

function baseEvent(overrides: Partial<AdapterEvent> = {}): AdapterEvent {
  return {
    externalId: 'ext-123',
    title: 'Vermont Jazz Festival',
    startsAtUtc: new Date('2025-07-15T18:00:00Z'),
    endsAtUtc: new Date('2025-07-15T22:00:00Z'),
    tzid: 'America/New_York',
    venueName: 'Burlington Town Center',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe('normalize', () => {
  const source = fakeSource();
  const log = fakeLog();

  // ---- Step 1: Title ----

  it('trims and collapses whitespace in title', () => {
    const event = baseEvent({ title: '  Hello   World  ' });
    const result = normalize(event, source, log);
    expect(result.title).toBe('Hello World');
  });

  it('truncates title at 300 chars with ellipsis', () => {
    const longTitle = 'A'.repeat(350);
    const event = baseEvent({ title: longTitle });
    const result = normalize(event, source, log);
    expect(result.title.length).toBe(300);
    expect(result.title.endsWith('\u2026')).toBe(true);
  });

  it('throws NormalizeError if title < 3 chars after trim', () => {
    const event = baseEvent({ title: 'ab' });
    expect(() => normalize(event, source, log)).toThrow(NormalizeError);
  });

  it('throws NormalizeError for empty title', () => {
    const event = baseEvent({ title: '  ' });
    expect(() => normalize(event, source, log)).toThrow(NormalizeError);
  });

  // ---- Step 2: HTML sanitization ----

  it('sanitizes HTML stripping disallowed tags', () => {
    const event = baseEvent({
      descriptionHtml:
        '<p>Hello</p><script>alert("xss")</script><div>world</div><strong>bold</strong>',
    });
    const result = normalize(event, source, log);
    // script and div should be stripped
    expect(result.description_html).not.toContain('<script>');
    expect(result.description_html).not.toContain('<div>');
    expect(result.description_html).toContain('<p>');
    expect(result.description_html).toContain('<strong>');
  });

  it('converts sanitized HTML to plain text for description', () => {
    const event = baseEvent({
      descriptionHtml: '<p>Hello <strong>world</strong></p>',
    });
    const result = normalize(event, source, log);
    expect(result.description).toBeTruthy();
    expect(result.description).not.toContain('<p>');
    expect(result.description).not.toContain('<strong>');
  });

  it('uses plain description when no descriptionHtml', () => {
    const event = baseEvent({
      description: 'Plain text description',
      descriptionHtml: undefined,
    });
    const result = normalize(event, source, log);
    expect(result.description).toBe('Plain text description');
    expect(result.description_html).toBeNull();
  });

  // ---- Step 7: Tags ----

  it('normalizes tags: lowercase, trim, dedupe, drop empties, cap at 12', () => {
    const event = baseEvent({
      tags: [
        'Jazz',
        ' jazz ',
        'MUSIC',
        '',
        '  ',
        'Art',
        'food',
        'dance',
        'theater',
        'film',
        'sports',
        'kids',
        'outdoor',
        'lecture',
        'fundraiser',
      ],
    });
    const result = normalize(event, source, log);
    expect(result.tags.length).toBeLessThanOrEqual(12);
    // All lowercase
    result.tags.forEach((t) => expect(t).toBe(t.toLowerCase()));
    // No duplicates
    expect(new Set(result.tags).size).toBe(result.tags.length);
    // No empty strings
    result.tags.forEach((t) => expect(t.length).toBeGreaterThan(0));
  });

  // ---- Step 4: All-day events ----

  it('expands all-day event: start at 00:00 in tzid, end at +24h', () => {
    const event = baseEvent({
      allDay: true,
      startsAtUtc: new Date('2025-07-15T14:00:00Z'), // 10 AM ET
      endsAtUtc: undefined,
    });
    const result = normalize(event, source, log);
    expect(result.all_day).toBe(true);

    // 00:00 America/New_York on July 15 = 04:00 UTC (EDT)
    expect(result.starts_at_utc.toISOString()).toBe('2025-07-15T04:00:00.000Z');

    // +24h
    expect(result.ends_at_utc).not.toBeNull();
    expect(result.ends_at_utc!.toISOString()).toBe('2025-07-16T04:00:00.000Z');
  });

  // ---- Step 8: URL validation ----

  it('accepts valid https URL', () => {
    const event = baseEvent({ url: 'https://example.com/event' });
    const result = normalize(event, source, log);
    expect(result.url).toBe('https://example.com/event');
  });

  it('accepts valid http URL', () => {
    const event = baseEvent({ url: 'http://example.com/event' });
    const result = normalize(event, source, log);
    expect(result.url).toBe('http://example.com/event');
  });

  it('drops non-http URL with debug log', () => {
    const logMock = fakeLog();
    const event = baseEvent({ url: 'ftp://example.com/event' });
    const result = normalize(event, source, logMock);
    expect(result.url).toBeNull();
    expect(logMock.debug).toHaveBeenCalled();
  });

  it('drops imageUrl that is not http(s)', () => {
    const logMock = fakeLog();
    const event = baseEvent({ imageUrl: 'data:image/png;base64,abc' });
    const result = normalize(event, source, logMock);
    expect(result.image_url).toBeNull();
    expect(logMock.debug).toHaveBeenCalled();
  });

  // ---- Step 9: External id ----

  it('uses adapter-supplied externalId after trim', () => {
    const event = baseEvent({ externalId: '  my-id-123  ' });
    const result = normalize(event, source, log);
    expect(result.external_id).toBe('my-id-123');
  });

  it('derives stable hash when externalId is null', () => {
    const event = baseEvent({ externalId: null });
    const result1 = normalize(event, source, log);
    const result2 = normalize(event, source, log);
    expect(result1.external_id).toBe(result2.external_id);
    expect(result1.external_id.length).toBe(16);
  });

  it('derives stable hash when externalId is empty string', () => {
    const event = baseEvent({ externalId: '   ' as unknown as string });
    const result = normalize(event, source, log);
    // Should have derived a hash (not empty/whitespace)
    expect(result.external_id.length).toBe(16);
  });

  // ---- Step 5 & 6: defaults ----

  it('defaults region to statewide', () => {
    const event = baseEvent({ region: undefined });
    const result = normalize(event, source, log);
    expect(result.region).toBe('statewide');
  });

  it('defaults category to other', () => {
    const event = baseEvent({ category: undefined });
    const result = normalize(event, source, log);
    expect(result.category).toBe('other');
  });

  // ---- Step 10: dedupe_key ----

  it('sets dedupe_key on the candidate', () => {
    const event = baseEvent();
    const result = normalize(event, source, log);
    expect(result.dedupe_key).toBeTruthy();
    // Should contain pipe separators
    expect(result.dedupe_key.split('|').length).toBe(3);
  });

  // ---- Source fields ----

  it('sets source_id from source', () => {
    const event = baseEvent();
    const result = normalize(event, source, log);
    expect(result.source_id).toBe(source.id);
  });

  it('uses adapter-supplied region', () => {
    const event = baseEvent({ region: 'northeast_kingdom' });
    const result = normalize(event, source, log);
    expect(result.region).toBe('northeast_kingdom');
  });
});

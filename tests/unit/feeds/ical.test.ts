import { describe, expect, it } from 'vitest';

import type { PublicEventDetail, PublicEventItem } from '@/lib/db/queries/events-schema';
import { buildCalendar, buildSingleEvent } from '@/lib/feeds/ical';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const SITE_URL = 'https://example.com';

function makeEventItem(overrides: Partial<PublicEventItem> = {}): PublicEventItem {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    title: 'Community Barn Dance',
    startsAt: '2026-06-15T22:00:00.000Z',
    endsAt: '2026-06-16T01:00:00.000Z',
    tzid: 'America/New_York',
    allDay: false,
    venueName: 'Town Hall',
    region: 'central_vt',
    category: 'music',
    tags: ['folk', 'dance'],
    url: '/events/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    sourceName: null,
    imageUrl: null,
    ...overrides,
  };
}

function makeEventDetail(overrides: Partial<PublicEventDetail> = {}): PublicEventDetail {
  return {
    ...makeEventItem(),
    description: 'A fun community event in the barn.',
    descriptionHtml: '<p>A fun community event in the barn.</p>',
    venueAddress: '123 Main St, Montpelier, VT',
    lat: null,
    lng: null,
    externalUrl: null,
    createdAt: '2026-06-01T12:00:00.000Z',
    publishedAt: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  buildCalendar tests                                                */
/* ------------------------------------------------------------------ */

describe('buildCalendar', () => {
  it('contains PRODID:-//vermont-events//EN', () => {
    const result = buildCalendar([makeEventItem()], SITE_URL);
    expect(result).toContain('PRODID:-//vermont-events//EN');
  });

  it('contains X-WR-CALNAME:Vermont Events', () => {
    const result = buildCalendar([makeEventItem()], SITE_URL);
    expect(result).toContain('X-WR-CALNAME:Vermont Events');
  });

  it('contains BEGIN:VTIMEZONE', () => {
    const result = buildCalendar([makeEventItem()], SITE_URL);
    expect(result).toContain('BEGIN:VTIMEZONE');
  });

  it('produces one BEGIN:VEVENT per input event', () => {
    const events = [
      makeEventItem({ id: 'aaa-1', url: '/events/aaa-1' }),
      makeEventItem({ id: 'aaa-2', url: '/events/aaa-2' }),
      makeEventItem({ id: 'aaa-3', url: '/events/aaa-3' }),
    ];
    const result = buildCalendar(events, SITE_URL);
    const veventCount = (result.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(veventCount).toBe(3);
  });

  it('formats DTSTART;TZID=America/New_York: correctly', () => {
    const result = buildCalendar([makeEventItem()], SITE_URL);
    expect(result).toContain('DTSTART;TZID=America/New_York:20260615T180000');
  });

  it('escapes commas in SUMMARY', () => {
    const result = buildCalendar([makeEventItem({ title: 'Music, Food, and Fun' })], SITE_URL);
    expect(result).toContain('SUMMARY:Music\\, Food\\, and Fun');
  });

  it('escapes semicolons in SUMMARY', () => {
    const result = buildCalendar([makeEventItem({ title: 'Event; Details' })], SITE_URL);
    expect(result).toContain('SUMMARY:Event\\; Details');
  });

  it('includes LOCATION with venue name', () => {
    const result = buildCalendar([makeEventItem()], SITE_URL);
    expect(result).toContain('LOCATION:Town Hall');
  });

  it('includes URL pointing to the event page', () => {
    const result = buildCalendar([makeEventItem()], SITE_URL);
    expect(result).toContain('URL:https://example.com/events/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('includes CATEGORIES with category and tags', () => {
    const result = buildCalendar([makeEventItem()], SITE_URL);
    expect(result).toContain('CATEGORIES:music,folk,dance');
  });

  it('returns empty calendar with no events', () => {
    const result = buildCalendar([], SITE_URL);
    expect(result).toContain('BEGIN:VCALENDAR');
    expect(result).toContain('END:VCALENDAR');
    expect(result).not.toContain('BEGIN:VEVENT');
  });

  it('includes UID with event id and domain', () => {
    const result = buildCalendar([makeEventItem()], SITE_URL);
    expect(result).toContain('UID:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@vermont-events.example.com');
  });
});

/* ------------------------------------------------------------------ */
/*  buildSingleEvent tests                                             */
/* ------------------------------------------------------------------ */

describe('buildSingleEvent', () => {
  it('contains PRODID:-//vermont-events//EN', () => {
    const result = buildSingleEvent(makeEventDetail(), SITE_URL);
    expect(result).toContain('PRODID:-//vermont-events//EN');
  });

  it('contains BEGIN:VEVENT and END:VEVENT', () => {
    const result = buildSingleEvent(makeEventDetail(), SITE_URL);
    expect(result).toContain('BEGIN:VEVENT');
    expect(result).toContain('END:VEVENT');
  });

  it('contains DESCRIPTION when description is present', () => {
    const result = buildSingleEvent(makeEventDetail(), SITE_URL);
    expect(result).toContain('DESCRIPTION:');
  });

  it('omits DESCRIPTION when description is null', () => {
    const result = buildSingleEvent(makeEventDetail({ description: null }), SITE_URL);
    expect(result).not.toContain('DESCRIPTION:');
  });

  it('contains LOCATION combining venue name and address', () => {
    const result = buildSingleEvent(makeEventDetail(), SITE_URL);
    expect(result).toContain('LOCATION:Town Hall\\, 123 Main St\\, Montpelier\\, VT');
  });

  it('escapes backslashes in title', () => {
    const result = buildSingleEvent(makeEventDetail({ title: 'Path\\to\\event' }), SITE_URL);
    expect(result).toContain('SUMMARY:Path\\\\to\\\\event');
  });

  it('escapes newlines in description', () => {
    const result = buildSingleEvent(
      makeEventDetail({ description: 'Line one\nLine two' }),
      SITE_URL,
    );
    expect(result).toContain('Line one\\nLine two');
  });

  it('folds lines longer than 75 octets', () => {
    const longDesc = 'A'.repeat(200);
    const result = buildSingleEvent(makeEventDetail({ description: longDesc }), SITE_URL);
    const lines = result.split('\r\n');
    const descriptionStart = lines.findIndex((l) => l.startsWith('DESCRIPTION:'));
    expect(descriptionStart).toBeGreaterThan(-1);
    // The next line should be a continuation (starts with space)
    expect(lines[descriptionStart + 1]![0]).toBe(' ');
  });

  it('omits DTEND when endsAt is null', () => {
    const result = buildSingleEvent(makeEventDetail({ endsAt: null }), SITE_URL);
    expect(result).not.toContain('DTEND');
  });

  it('contains DTEND when endsAt is present', () => {
    const result = buildSingleEvent(makeEventDetail(), SITE_URL);
    expect(result).toContain('DTEND;TZID=America/New_York:');
  });
});

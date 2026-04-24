import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line import-x/order
import type { PublicEventDetail } from '@/lib/db/queries/events-schema';

/* ------------------------------------------------------------------ */
/*  Mock getPublicEventById before importing the route                  */
/* ------------------------------------------------------------------ */

const mockGetPublicEventById = vi.fn<(id: string) => Promise<PublicEventDetail | null>>();

vi.mock('@/lib/db/queries/events', () => ({
  getPublicEventById: (...args: unknown[]) => mockGetPublicEventById(args[0] as string),
}));

vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_SITE_DOMAIN: 'http://localhost:3000' },
}));

/* ------------------------------------------------------------------ */
/*  Import the route handler under test                                 */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line import-x/order
import { GET } from '@/app/(public)/events/[id]/ics/route';

/* ------------------------------------------------------------------ */
/*  Fixture                                                             */
/* ------------------------------------------------------------------ */

function makeEvent(overrides: Partial<PublicEventDetail> = {}): PublicEventDetail {
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
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe('GET /events/[id]/ics', () => {
  beforeEach(() => {
    mockGetPublicEventById.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ---------------------------------------------------------------- */
  /*  404 for non-existent event                                        */
  /* ---------------------------------------------------------------- */

  it('returns 404 when event is not found', async () => {
    mockGetPublicEventById.mockResolvedValue(null);
    const request = new Request('http://localhost/events/unknown-id/ics');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'unknown-id' }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Not found');
  });

  /* ---------------------------------------------------------------- */
  /*  200 with valid VCALENDAR                                          */
  /* ---------------------------------------------------------------- */

  describe('200 response', () => {
    it('returns text/calendar content type', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent());
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    });

    it('sets Cache-Control to public, max-age=3600', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent());
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    });

    it('sets Content-Disposition with .ics filename', async () => {
      const event = makeEvent();
      mockGetPublicEventById.mockResolvedValue(event);
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const disposition = response.headers.get('Content-Disposition');
      expect(disposition).toContain('.ics');
      expect(disposition).toContain(event.id);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  VCALENDAR structure                                               */
  /* ---------------------------------------------------------------- */

  describe('VCALENDAR structure', () => {
    it('starts with BEGIN:VCALENDAR and ends with END:VCALENDAR', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent());
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('BEGIN:VCALENDAR');
      expect(body).toContain('END:VCALENDAR');
    });

    it('contains VERSION:2.0 and PRODID', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent());
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('VERSION:2.0');
      expect(body).toContain('PRODID:-//vermont-events//EN');
    });

    it('contains BEGIN:VEVENT and END:VEVENT', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent());
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('BEGIN:VEVENT');
      expect(body).toContain('END:VEVENT');
    });

    it('contains UID with event id', async () => {
      const event = makeEvent();
      mockGetPublicEventById.mockResolvedValue(event);
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('UID:' + event.id + '@vermont-events.');
    });

    it('contains SUMMARY with escaped event title', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent());
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('SUMMARY:Community Barn Dance');
    });

    it('contains DTSTART with TZID', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent());
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('DTSTART;TZID=America/New_York:');
    });

    it('contains DTEND when endsAt is present', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent());
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('DTEND;TZID=America/New_York:');
    });

    it('omits DTEND when endsAt is null', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent({ endsAt: null }));
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).not.toContain('DTEND');
    });

    it('contains DESCRIPTION when description is present', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent());
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('DESCRIPTION:');
    });

    it('omits DESCRIPTION when description is null', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent({ description: null }));
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).not.toContain('DESCRIPTION:');
    });

    it('contains LOCATION combining venue name and address', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent());
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('LOCATION:');
      expect(body).toContain('Town Hall');
    });

    it('omits LOCATION when both venueName and venueAddress are null', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent({ venueName: null, venueAddress: null }));
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).not.toContain('LOCATION:');
    });

    it('contains URL pointing to event detail page', async () => {
      const event = makeEvent();
      mockGetPublicEventById.mockResolvedValue(event);
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('URL:http://localhost:3000/events/' + event.id);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  RFC 5545 text escaping                                            */
  /* ---------------------------------------------------------------- */

  describe('RFC 5545 text escaping', () => {
    it('escapes commas in event title', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent({ title: 'Music, Food, and Fun' }));
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('SUMMARY:Music\\, Food\\, and Fun');
    });

    it('escapes semicolons in description', async () => {
      mockGetPublicEventById.mockResolvedValue(
        makeEvent({ description: 'Bring items; snacks welcome' }),
      );
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('Bring items\\; snacks welcome');
    });

    it('escapes newlines in description', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent({ description: 'Line one\nLine two' }));
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('Line one\\nLine two');
    });

    it('escapes backslashes in title', async () => {
      mockGetPublicEventById.mockResolvedValue(makeEvent({ title: 'Path\\to\\event' }));
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      expect(body).toContain('SUMMARY:Path\\\\to\\\\event');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Line folding (RFC 5545)                                           */
  /* ---------------------------------------------------------------- */

  describe('RFC 5545 line folding', () => {
    it('folds lines longer than 75 octets', async () => {
      const longDescription = 'A'.repeat(200);
      mockGetPublicEventById.mockResolvedValue(makeEvent({ description: longDescription }));
      const request = new Request('http://localhost/events/test-id/ics');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'test-id' }),
      });

      const body = await response.text();
      // After folding, continuation lines start with a space
      const lines = body.split('\r\n');
      const descriptionStart = lines.findIndex((l: string) => l.startsWith('DESCRIPTION:'));
      expect(descriptionStart).toBeGreaterThan(-1);
      // The next line should be a continuation (starts with space)
      expect(lines[descriptionStart + 1]![0]).toBe(' ');
    });
  });
});

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line import-x/order
import type { PublicEventItem, PublicEventsPage } from '@/lib/db/queries/events-schema';

/* ------------------------------------------------------------------ */
/*  Mocks -- must be declared before importing the route               */
/* ------------------------------------------------------------------ */

const mockListPublicEvents = vi.fn<(...args: unknown[]) => Promise<PublicEventsPage>>();

vi.mock('@/lib/db/queries/events', async () => {
  const schema = await import('@/lib/db/queries/events-schema');
  return {
    PublicEventsQuerySchema: schema.PublicEventsQuerySchema,
    listPublicEvents: (...args: unknown[]) => mockListPublicEvents(...args),
  };
});

vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_SITE_DOMAIN: 'https://example.com' },
}));

vi.mock('@/lib/log', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

/* ------------------------------------------------------------------ */
/*  Import the route handler under test                                */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line import-x/order
import { GET } from '@/app/feed.ics/route';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('GET /feed.ics', () => {
  beforeEach(() => {
    mockListPublicEvents.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ---------------------------------------------------------------- */
  /*  Happy path                                                       */
  /* ---------------------------------------------------------------- */

  it('returns 200 with text/calendar content type', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [makeEventItem()],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.ics');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
  });

  it('returns Cache-Control: public, max-age=600, s-maxage=600', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [makeEventItem()],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.ics');
    const response = await GET(request);

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=600, s-maxage=600');
  });

  it('returns a valid VCALENDAR body', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [makeEventItem()],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.ics');
    const response = await GET(request);
    const body = await response.text();

    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('PRODID:-//vermont-events//EN');
    expect(body).toContain('X-WR-CALNAME:Vermont Events');
    expect(body).toContain('BEGIN:VTIMEZONE');
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('END:VCALENDAR');
  });

  it('returns VEVENT count matching events from listPublicEvents', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [
        makeEventItem({ id: 'e1', url: '/events/e1' }),
        makeEventItem({ id: 'e2', url: '/events/e2' }),
      ],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.ics');
    const response = await GET(request);
    const body = await response.text();

    const veventCount = (body.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(veventCount).toBe(2);
  });

  /* ---------------------------------------------------------------- */
  /*  Query parameter pass-through                                     */
  /* ---------------------------------------------------------------- */

  it('passes region filter through to listPublicEvents', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.ics?region=burlington_area');
    await GET(request);

    expect(mockListPublicEvents).toHaveBeenCalledTimes(1);
    const callArg = mockListPublicEvents.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArg.region).toBe('burlington_area');
  });

  /* ---------------------------------------------------------------- */
  /*  Empty events                                                     */
  /* ---------------------------------------------------------------- */

  it('returns valid VCALENDAR with zero events', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.ics');
    const response = await GET(request);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('END:VCALENDAR');
    expect(body).not.toContain('BEGIN:VEVENT');
  });

  /* ---------------------------------------------------------------- */
  /*  Error handling                                                    */
  /* ---------------------------------------------------------------- */

  it('returns 500 when listPublicEvents throws', async () => {
    mockListPublicEvents.mockRejectedValue(new Error('DB down'));

    const request = new NextRequest('http://localhost:3000/feed.ics');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toBe('Internal Server Error');
  });
});

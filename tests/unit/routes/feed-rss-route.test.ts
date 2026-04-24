import { XMLParser } from 'fast-xml-parser';
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
import { GET } from '@/app/feed.rss/route';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseRss(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  return parser.parse(xml);
}

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

describe('GET /feed.rss', () => {
  beforeEach(() => {
    mockListPublicEvents.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ---------------------------------------------------------------- */
  /*  Happy path                                                       */
  /* ---------------------------------------------------------------- */

  it('returns 200 with application/rss+xml content type', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [makeEventItem()],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.rss');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8');
  });

  it('returns Cache-Control: public, max-age=600, s-maxage=600', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [makeEventItem()],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.rss');
    const response = await GET(request);

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=600, s-maxage=600');
  });

  it('returns valid RSS XML that round-trips through a parser', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [makeEventItem()],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.rss');
    const response = await GET(request);
    const body = await response.text();

    expect(() => parseRss(body)).not.toThrow();
  });

  it('RSS channel title is "Vermont Events"', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [makeEventItem()],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.rss');
    const response = await GET(request);
    const body = await response.text();
    const parsed = parseRss(body) as {
      rss: { channel: { title: string } };
    };

    expect(parsed.rss.channel.title).toBe('Vermont Events');
  });

  it('item count matches events from listPublicEvents', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [
        makeEventItem({ id: 'e1', url: '/events/e1' }),
        makeEventItem({ id: 'e2', url: '/events/e2' }),
        makeEventItem({ id: 'e3', url: '/events/e3' }),
      ],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.rss');
    const response = await GET(request);
    const body = await response.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => name === 'item',
    });
    const parsed = parser.parse(body) as {
      rss: { channel: { item: unknown[] } };
    };

    expect(parsed.rss.channel.item).toHaveLength(3);
  });

  /* ---------------------------------------------------------------- */
  /*  Query parameter pass-through                                     */
  /* ---------------------------------------------------------------- */

  it('passes category filter through to listPublicEvents', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.rss?category=music');
    await GET(request);

    expect(mockListPublicEvents).toHaveBeenCalledTimes(1);
    const callArg = mockListPublicEvents.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArg.category).toBe('music');
  });

  /* ---------------------------------------------------------------- */
  /*  Empty events                                                     */
  /* ---------------------------------------------------------------- */

  it('returns valid RSS with zero items', async () => {
    mockListPublicEvents.mockResolvedValue({
      events: [],
      nextCursor: null,
    });

    const request = new NextRequest('http://localhost:3000/feed.rss');
    const response = await GET(request);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(() => parseRss(body)).not.toThrow();
    const parsed = parseRss(body) as {
      rss: { channel: { title: string } };
    };
    expect(parsed.rss.channel.title).toBe('Vermont Events');
  });

  /* ---------------------------------------------------------------- */
  /*  Error handling                                                    */
  /* ---------------------------------------------------------------- */

  it('returns 500 when listPublicEvents throws', async () => {
    mockListPublicEvents.mockRejectedValue(new Error('DB down'));

    const request = new NextRequest('http://localhost:3000/feed.rss');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toBe('Internal Server Error');
  });
});

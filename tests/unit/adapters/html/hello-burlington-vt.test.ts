import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { helloBurlingtonVtAdapter } from '@/lib/adapters/html/hello-burlington-vt';
import type { AdapterContext, AdapterEvent } from '@/lib/adapters/types';
import { toZoned } from '@/lib/tz';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const LISTING_FIXTURE = fs.readFileSync(
  path.resolve(__dirname, '../../../fixtures/hello-burlington-vt/listing-page-1.html'),
  'utf-8',
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fakeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000070',
    name: 'HelloBurlingtonVT Events',
    slug: 'hello-burlington-vt',
    kind: 'whitelist' as const,
    adapter_type: 'html' as const,
    adapter_key: 'hello-burlington-vt',
    url: 'https://helloburlingtonvt.com/events',
    adapter_config: { pages: 1 },
    trust_level: 'auto_publish' as const,
    is_active: true,
    contact_url: null,
    rate_limit_per_min: 30,
    robots_respect: true,
    last_run_at: null,
    last_run_status: null,
    consecutive_failures: 0,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides,
  };
}

const noopLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => noopLogger,
};

function buildMockFetch() {
  return vi.fn().mockImplementation(() => {
    return Promise.resolve({
      text: () => Promise.resolve(LISTING_FIXTURE),
    });
  });
}

function buildCtx(overrides: Record<string, unknown> = {}): AdapterContext {
  return {
    source: fakeSource(overrides) as AdapterContext['source'],
    log: noopLogger,
    fetch: buildMockFetch(),
    now: () => new Date('2026-05-01T12:00:00Z'),
  };
}

async function collectEvents(ctx: AdapterContext): Promise<AdapterEvent[]> {
  const events: AdapterEvent[] = [];
  for await (const event of helloBurlingtonVtAdapter.ingest(ctx)) {
    events.push(event);
  }
  return events;
}

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                   */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('hello-burlington-vt html adapter', () => {
  describe('adapter metadata', () => {
    it('has key "hello-burlington-vt"', () => {
      expect(helloBurlingtonVtAdapter.key).toBe('hello-burlington-vt');
    });

    it('exposes a configSchema', () => {
      expect(helloBurlingtonVtAdapter.configSchema).toBeDefined();
    });
  });

  describe('listing page parsing', () => {
    it('yields at least 3 AdapterEvents for the fixture page', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);
      expect(events.length).toBeGreaterThanOrEqual(3);
    });

    it('each event has title, startsAtUtc (Date), tzid="America/New_York", externalId (non-empty)', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      for (const event of events) {
        expect(event.title).toBeTruthy();
        expect(event.startsAtUtc).toBeInstanceOf(Date);
        expect(event.tzid).toBe('America/New_York');
        expect(event.externalId).toBeTruthy();
      }
    });

    it('parses the Burlington Jazz Weekend event correctly', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find((e) => e.externalId === 'burlington-jazz-weekend-2026');
      expect(jazz).toBeDefined();
      expect(jazz!.title).toBe('Burlington Jazz Weekend');
      expect(jazz!.venueName).toBe('Waterfront Park');
      expect(jazz!.url).toContain('/event/burlington-jazz-weekend-2026');
      expect(jazz!.descriptionHtml).toContain('world-class jazz');
    });

    it('parses the Waking Windows event correctly', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const waking = events.find((e) => e.externalId === 'waking-windows-festival-2026');
      expect(waking).toBeDefined();
      expect(waking!.title).toBe('Waking Windows Festival');
      expect(waking!.venueName).toBe('Downtown Winooski');
    });

    it('parses the Farmers Market event correctly', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const market = events.find((e) => e.externalId === 'burlington-farmers-market-summer');
      expect(market).toBeDefined();
      expect(market!.title).toBe('Burlington Farmers Market');
      expect(market!.venueName).toBe('City Hall Park');
    });

    it('parses image URLs', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find((e) => e.externalId === 'burlington-jazz-weekend-2026');
      expect(jazz).toBeDefined();
      expect(jazz!.imageUrl).toContain('jazz-fest-2026.jpg');
    });

    it('sets allDay correctly based on time presence', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      // Events with explicit times should not be allDay
      const jazz = events.find((e) => e.externalId === 'burlington-jazz-weekend-2026');
      expect(jazz!.allDay).toBe(false);

      // Art Hop has no time, should be allDay
      const artHop = events.find((e) => e.externalId === 'south-end-art-hop-2026');
      expect(artHop!.allDay).toBe(true);
    });
  });

  describe('UTC round-trip', () => {
    it('Burlington Jazz Weekend startsAtUtc round-trips to expected ET local date/time', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find((e) => e.externalId === 'burlington-jazz-weekend-2026');
      expect(jazz).toBeDefined();

      // "Sat, May 2, 2026 7:00 PM" ET (EDT, UTC-4) = 23:00 UTC
      expect(jazz!.startsAtUtc.toISOString()).toBe('2026-05-02T23:00:00.000Z');

      // Round-trip back to ET local time
      const local = toZoned(jazz!.startsAtUtc, 'America/New_York');
      expect(local.getHours()).toBe(19); // 7 PM
      expect(local.getMinutes()).toBe(0);
      expect(local.getMonth()).toBe(4); // May (0-indexed)
      expect(local.getDate()).toBe(2);
    });
  });

  describe('skipping invalid cards', () => {
    it('skips cards without a title', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      // No event should have an empty title
      for (const event of events) {
        expect(event.title.length).toBeGreaterThan(0);
      }
    });

    it('skips cards without a date', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const mystery = events.find((e) => e.title === 'Mystery Event With No Date');
      expect(mystery).toBeUndefined();
    });

    it('yields exactly 5 valid events from the 7-card fixture', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      // 7 cards total, 2 invalid (no title, no date) = 5 valid
      expect(events).toHaveLength(5);
    });
  });

  describe('pagination config', () => {
    it('defaults pages to 2 when not specified', () => {
      const parsed = helloBurlingtonVtAdapter.configSchema!.parse({});
      expect(parsed).toEqual({ pages: 2 });
    });

    it('accepts custom page count', () => {
      const parsed = helloBurlingtonVtAdapter.configSchema!.parse({ pages: 5 });
      expect(parsed).toEqual({ pages: 5 });
    });

    it('rejects pages > 20', () => {
      expect(() => helloBurlingtonVtAdapter.configSchema!.parse({ pages: 25 })).toThrow();
    });

    it('rejects pages < 1', () => {
      expect(() => helloBurlingtonVtAdapter.configSchema!.parse({ pages: 0 })).toThrow();
    });

    it('accepts undefined config (outer default)', () => {
      expect(() => helloBurlingtonVtAdapter.configSchema!.parse(undefined)).not.toThrow();
    });
  });

  describe('multi-page pagination', () => {
    it('fetches page 2 with ?page=2 appended to source URL', async () => {
      const mockFetch = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ text: () => Promise.resolve(LISTING_FIXTURE) }),
        );
      const ctx: AdapterContext = {
        source: fakeSource({
          adapter_config: { pages: 2 },
        }) as AdapterContext['source'],
        log: noopLogger,
        fetch: mockFetch,
        now: () => new Date('2026-05-01T12:00:00Z'),
      };
      await collectEvents(ctx);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0]![0]).toBe('https://helloburlingtonvt.com/events');
      expect(mockFetch.mock.calls[1]![0]).toBe('https://helloburlingtonvt.com/events?page=2');
    });

    it('uses &page=N when source URL already contains a query string', async () => {
      const mockFetch = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ text: () => Promise.resolve(LISTING_FIXTURE) }),
        );
      const ctx: AdapterContext = {
        source: fakeSource({
          url: 'https://helloburlingtonvt.com/events?category=music',
          adapter_config: { pages: 2 },
        }) as AdapterContext['source'],
        log: noopLogger,
        fetch: mockFetch,
        now: () => new Date('2026-05-01T12:00:00Z'),
      };
      await collectEvents(ctx);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1]![0]).toBe(
        'https://helloburlingtonvt.com/events?category=music&page=2',
      );
    });

    it('stops pagination early when a page returns no .slide cards', async () => {
      const emptyPage = '<html><body><div id="layoutjs_events"></div></body></html>';
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        const html = callCount === 1 ? LISTING_FIXTURE : emptyPage;
        return Promise.resolve({ text: () => Promise.resolve(html) });
      });
      const ctx: AdapterContext = {
        source: fakeSource({
          adapter_config: { pages: 5 },
        }) as AdapterContext['source'],
        log: noopLogger,
        fetch: mockFetch,
        now: () => new Date('2026-05-01T12:00:00Z'),
      };
      const events = await collectEvents(ctx);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(events).toHaveLength(5);
    });
  });

  describe('logger assertions on skipped cards', () => {
    it('logs debug when skipping card with missing title', async () => {
      const ctx = buildCtx();
      await collectEvents(ctx);

      expect(noopLogger.debug).toHaveBeenCalledWith(
        'skipping card: missing title',
        expect.objectContaining({ page: 1 }),
      );
    });

    it('logs debug when skipping card with missing date', async () => {
      const ctx = buildCtx();
      await collectEvents(ctx);

      expect(noopLogger.debug).toHaveBeenCalledWith(
        'skipping card: missing date',
        expect.objectContaining({
          title: 'Mystery Event With No Date',
          page: 1,
        }),
      );
    });
  });

  describe('unparseable date handling', () => {
    it('skips card with date text that does not match any known format', async () => {
      const htmlWithBadDate =
        '<html><body><div class="slide"><div class="content-section"><h3 class="slide-title"><a href="https://helloburlingtonvt.com/event/bad-date-event/">Bad Date Event</a></h3><ul class="details"><li class="info-item"><i class="fas fa-calendar-week"></i><span>TBD 2026</span></li></ul><p>Event with unparseable date.</p></div></div></body></html>';
      const mockFetch = vi.fn().mockResolvedValue({
        text: () => Promise.resolve(htmlWithBadDate),
      });
      const ctx: AdapterContext = {
        source: fakeSource() as AdapterContext['source'],
        log: noopLogger,
        fetch: mockFetch,
        now: () => new Date('2026-05-01T12:00:00Z'),
      };
      const events = await collectEvents(ctx);

      expect(events).toHaveLength(0);
      expect(noopLogger.warn).toHaveBeenCalledWith(
        'skipping card: unparseable date',
        expect.objectContaining({
          title: 'Bad Date Event',
          dateText: 'TBD 2026',
        }),
      );
    });
  });

  describe('UTC round-trip edge cases', () => {
    it('Farmers Market 9:00 AM round-trips correctly (AM morning event)', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const market = events.find((e) => e.externalId === 'burlington-farmers-market-summer');
      expect(market).toBeDefined();

      expect(market!.startsAtUtc.toISOString()).toBe('2026-05-09T13:00:00.000Z');
      expect(market!.allDay).toBe(false);

      const local = toZoned(market!.startsAtUtc, 'America/New_York');
      expect(local.getHours()).toBe(9);
      expect(local.getMinutes()).toBe(0);
    });

    it('all-day Art Hop event starts at midnight local (04:00 UTC in EDT)', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const artHop = events.find((e) => e.externalId === 'south-end-art-hop-2026');
      expect(artHop).toBeDefined();

      expect(artHop!.startsAtUtc.toISOString()).toBe('2026-05-15T04:00:00.000Z');
      expect(artHop!.allDay).toBe(true);

      const local = toZoned(artHop!.startsAtUtc, 'America/New_York');
      expect(local.getHours()).toBe(0);
      expect(local.getDate()).toBe(15);
    });

    it('Lake Champlain Century Ride 6:30 AM round-trips correctly', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const ride = events.find((e) => e.externalId === 'lake-champlain-century-ride');
      expect(ride).toBeDefined();

      expect(ride!.startsAtUtc.toISOString()).toBe('2026-05-24T10:30:00.000Z');
      expect(ride!.allDay).toBe(false);

      const local = toZoned(ride!.startsAtUtc, 'America/New_York');
      expect(local.getHours()).toBe(6);
      expect(local.getMinutes()).toBe(30);
    });
  });

  describe('field extraction completeness', () => {
    it('extracts description text (plain text) from content-section', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find((e) => e.externalId === 'burlington-jazz-weekend-2026');
      expect(jazz).toBeDefined();
      expect(jazz!.description).toContain('world-class jazz');
      expect(typeof jazz!.description).toBe('string');
    });

    it('extracts full URL for each event', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      for (const event of events) {
        expect(event.url).toBeDefined();
        expect(event.url).toContain('https://helloburlingtonvt.com/event/');
      }
    });

    it('extracts imageUrl for each event in the fixture', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      for (const event of events) {
        expect(event.imageUrl).toBeDefined();
        expect(event.imageUrl).toContain('https://res.cloudinary.com/helloburlingtonvt/');
      }
    });

    it('does not set endsAtUtc (adapter does not extract end times)', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      for (const event of events) {
        expect(event.endsAtUtc).toBeUndefined();
      }
    });

    it('does not set category (adapter does not map categories)', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      for (const event of events) {
        expect(event.category).toBeUndefined();
      }
    });
  });

  describe('edge case HTML structures', () => {
    it('handles card with no venue info-item gracefully', async () => {
      const htmlNoVenue =
        '<html><body><div class="slide"><div class="content-section"><h3 class="slide-title"><a href="https://helloburlingtonvt.com/event/no-venue-event/">No Venue Event</a></h3><ul class="details"><li class="info-item"><i class="fas fa-calendar-week"></i><span>Sat, Jun 6, 2026 3:00 PM</span></li></ul><p>An event without a venue.</p></div></div></body></html>';
      const mockFetch = vi.fn().mockResolvedValue({
        text: () => Promise.resolve(htmlNoVenue),
      });
      const ctx: AdapterContext = {
        source: fakeSource() as AdapterContext['source'],
        log: noopLogger,
        fetch: mockFetch,
        now: () => new Date('2026-05-01T12:00:00Z'),
      };
      const events = await collectEvents(ctx);

      expect(events).toHaveLength(1);
      expect(events[0]!.title).toBe('No Venue Event');
      expect(events[0]!.venueName).toBeUndefined();
    });

    it('handles card with no description gracefully', async () => {
      const htmlNoDesc =
        '<html><body><div class="slide"><div class="content-section"><h3 class="slide-title"><a href="https://helloburlingtonvt.com/event/no-desc/">No Description Event</a></h3><ul class="details"><li class="info-item"><i class="fas fa-calendar-week"></i><span>Sat, Jun 6, 2026 3:00 PM</span></li></ul></div></div></body></html>';
      const mockFetch = vi.fn().mockResolvedValue({
        text: () => Promise.resolve(htmlNoDesc),
      });
      const ctx: AdapterContext = {
        source: fakeSource() as AdapterContext['source'],
        log: noopLogger,
        fetch: mockFetch,
        now: () => new Date('2026-05-01T12:00:00Z'),
      };
      const events = await collectEvents(ctx);

      expect(events).toHaveLength(1);
      expect(events[0]!.description).toBeUndefined();
      expect(events[0]!.descriptionHtml).toBeUndefined();
    });

    it('handles card with no image gracefully', async () => {
      const htmlNoImage =
        '<html><body><div class="slide"><div class="content-section"><h3 class="slide-title"><a href="https://helloburlingtonvt.com/event/no-image/">No Image Event</a></h3><ul class="details"><li class="info-item"><i class="fas fa-calendar-week"></i><span>Sat, Jun 6, 2026 3:00 PM</span></li></ul><p>No image provided.</p></div></div></body></html>';
      const mockFetch = vi.fn().mockResolvedValue({
        text: () => Promise.resolve(htmlNoImage),
      });
      const ctx: AdapterContext = {
        source: fakeSource() as AdapterContext['source'],
        log: noopLogger,
        fetch: mockFetch,
        now: () => new Date('2026-05-01T12:00:00Z'),
      };
      const events = await collectEvents(ctx);

      expect(events).toHaveLength(1);
      expect(events[0]!.imageUrl).toBeUndefined();
    });

    it('handles href without /event/ path (externalId = null)', async () => {
      const htmlNoEventPath =
        '<html><body><div class="slide"><div class="content-section"><h3 class="slide-title"><a href="https://helloburlingtonvt.com/listing/some-place/">Some Place Event</a></h3><ul class="details"><li class="info-item"><i class="fas fa-calendar-week"></i><span>Sat, Jun 6, 2026 3:00 PM</span></li></ul><p>Event with a non-standard URL path.</p></div></div></body></html>';
      const mockFetch = vi.fn().mockResolvedValue({
        text: () => Promise.resolve(htmlNoEventPath),
      });
      const ctx: AdapterContext = {
        source: fakeSource() as AdapterContext['source'],
        log: noopLogger,
        fetch: mockFetch,
        now: () => new Date('2026-05-01T12:00:00Z'),
      };
      const events = await collectEvents(ctx);

      expect(events).toHaveLength(1);
      expect(events[0]!.externalId).toBeNull();
      expect(events[0]!.url).toContain('/listing/some-place/');
    });

    it('handles date string without leading day-of-week prefix', async () => {
      const htmlNoDow =
        '<html><body><div class="slide"><div class="content-section"><h3 class="slide-title"><a href="https://helloburlingtonvt.com/event/no-dow/">No Day Of Week</a></h3><ul class="details"><li class="info-item"><i class="fas fa-calendar-week"></i><span>June 20, 2026 8:00 PM</span></li></ul><p>Date without day-of-week prefix.</p></div></div></body></html>';
      const mockFetch = vi.fn().mockResolvedValue({
        text: () => Promise.resolve(htmlNoDow),
      });
      const ctx: AdapterContext = {
        source: fakeSource() as AdapterContext['source'],
        log: noopLogger,
        fetch: mockFetch,
        now: () => new Date('2026-05-01T12:00:00Z'),
      };
      const events = await collectEvents(ctx);

      expect(events).toHaveLength(1);
      expect(events[0]!.title).toBe('No Day Of Week');
      expect(events[0]!.startsAtUtc.toISOString()).toBe('2026-06-21T00:00:00.000Z');
      expect(events[0]!.allDay).toBe(false);
    });

    it('handles 12:00 PM (noon) correctly', async () => {
      const htmlNoon =
        '<html><body><div class="slide"><div class="content-section"><h3 class="slide-title"><a href="https://helloburlingtonvt.com/event/noon-event/">Noon Event</a></h3><ul class="details"><li class="info-item"><i class="fas fa-calendar-week"></i><span>Mon, Jun 1, 2026 12:00 PM</span></li></ul><p>Event at noon.</p></div></div></body></html>';
      const mockFetch = vi.fn().mockResolvedValue({
        text: () => Promise.resolve(htmlNoon),
      });
      const ctx: AdapterContext = {
        source: fakeSource() as AdapterContext['source'],
        log: noopLogger,
        fetch: mockFetch,
        now: () => new Date('2026-05-01T12:00:00Z'),
      };
      const events = await collectEvents(ctx);

      expect(events).toHaveLength(1);
      expect(events[0]!.startsAtUtc.toISOString()).toBe('2026-06-01T16:00:00.000Z');

      const local = toZoned(events[0]!.startsAtUtc, 'America/New_York');
      expect(local.getHours()).toBe(12);
    });

    it('handles 12:00 AM (midnight) correctly', async () => {
      const htmlMidnight =
        '<html><body><div class="slide"><div class="content-section"><h3 class="slide-title"><a href="https://helloburlingtonvt.com/event/midnight-event/">Midnight Event</a></h3><ul class="details"><li class="info-item"><i class="fas fa-calendar-week"></i><span>Mon, Jun 1, 2026 12:00 AM</span></li></ul><p>Event at midnight.</p></div></div></body></html>';
      const mockFetch = vi.fn().mockResolvedValue({
        text: () => Promise.resolve(htmlMidnight),
      });
      const ctx: AdapterContext = {
        source: fakeSource() as AdapterContext['source'],
        log: noopLogger,
        fetch: mockFetch,
        now: () => new Date('2026-05-01T12:00:00Z'),
      };
      const events = await collectEvents(ctx);

      expect(events).toHaveLength(1);
      expect(events[0]!.startsAtUtc.toISOString()).toBe('2026-06-01T04:00:00.000Z');

      const local = toZoned(events[0]!.startsAtUtc, 'America/New_York');
      expect(local.getHours()).toBe(0);
    });
  });
});

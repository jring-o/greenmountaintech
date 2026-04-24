import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { vermontPublicAdapter } from '@/lib/adapters/html/vermont-public';
import type { AdapterContext, AdapterEvent } from '@/lib/adapters/types';
import { toZoned } from '@/lib/tz';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const LISTING_FIXTURE = fs.readFileSync(
  path.resolve(__dirname, '../../../fixtures/vermont-public/listing-page-1.html'),
  'utf-8',
);

const DETAIL_FIXTURE = fs.readFileSync(
  path.resolve(__dirname, '../../../fixtures/vermont-public/event-detail-1.html'),
  'utf-8',
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fakeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000020',
    name: 'Vermont Public',
    slug: 'vermont-public',
    kind: 'whitelist' as const,
    adapter_type: 'html' as const,
    adapter_key: 'vermont-public',
    url: 'https://www.vermontpublic.org/vermont-events-calendar',
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

/**
 * Build a mock ctx.fetch that returns the listing fixture for the calendar URL
 * and the detail fixture for detail page URLs.
 */
function buildMockFetch() {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('vermont-events-calendar/event/')) {
      // Detail page
      return Promise.resolve({
        text: () => Promise.resolve(DETAIL_FIXTURE),
      });
    }
    // Listing page
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
    now: () => new Date('2025-05-01T12:00:00Z'),
  };
}

async function collectEvents(ctx: AdapterContext): Promise<AdapterEvent[]> {
  const events: AdapterEvent[] = [];
  for await (const event of vermontPublicAdapter.ingest(ctx)) {
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

describe('vermont-public html adapter', () => {
  describe('adapter metadata', () => {
    it('has key "vermont-public"', () => {
      expect(vermontPublicAdapter.key).toBe('vermont-public');
    });

    it('exposes a configSchema', () => {
      expect(vermontPublicAdapter.configSchema).toBeDefined();
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

      const jazz = events.find(
        (e) => e.externalId === 'burlington-jazz-weekend-05-01-2025-12-00-00',
      );
      expect(jazz).toBeDefined();
      expect(jazz!.title).toBe('Burlington Jazz Weekend');
      expect(jazz!.venueName).toBe('Waterfront Park');
      expect(jazz!.category).toBe('music');
      expect(jazz!.url).toContain('/vermont-events-calendar/event/burlington-jazz-weekend');
    });

    it('parses event with end time', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find(
        (e) => e.externalId === 'burlington-jazz-weekend-05-01-2025-12-00-00',
      );
      expect(jazz).toBeDefined();
      expect(jazz!.endsAtUtc).toBeInstanceOf(Date);
      // 11:00 PM ET on May 17 2025 = 03:00 UTC on May 18
      expect(jazz!.endsAtUtc!.toISOString()).toBe('2025-05-18T03:00:00.000Z');
    });

    it('parses the Green Mountain Film Fest event correctly', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const film = events.find(
        (e) => e.externalId === 'green-mountain-film-fest-05-02-2025-10-30-00',
      );
      expect(film).toBeDefined();
      expect(film!.title).toBe('Green Mountain Film Fest');
      expect(film!.venueName).toBe('Main Street Landing');
      expect(film!.category).toBe('film');
    });

    it('maps category "Food & Drink" to "food_drink"', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const market = events.find(
        (e) => e.externalId === 'burlington-farmers-market-04-15-2025-08-00-00',
      );
      expect(market).toBeDefined();
      expect(market!.category).toBe('food_drink');
    });

    it('maps category "Art & Museum Exhibits" to "arts_theater"', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const museum = events.find(
        (e) => e.externalId === 'shelburne-museum-opening-05-06-2025-11-00-00',
      );
      expect(museum).toBeDefined();
      expect(museum!.category).toBe('arts_theater');
    });
  });

  describe('UTC round-trip', () => {
    it('Burlington Jazz Weekend startsAtUtc round-trips to expected ET local time', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find(
        (e) => e.externalId === 'burlington-jazz-weekend-05-01-2025-12-00-00',
      );
      expect(jazz).toBeDefined();

      // 7:00 PM EDT on May 17 2025 = 23:00 UTC on May 17
      expect(jazz!.startsAtUtc.toISOString()).toBe('2025-05-17T23:00:00.000Z');

      // Round-trip back to ET local time
      const local = toZoned(jazz!.startsAtUtc, 'America/New_York');
      expect(local.getHours()).toBe(19); // 7 PM
      expect(local.getMinutes()).toBe(0);
      expect(local.getMonth()).toBe(4); // May (0-indexed)
      expect(local.getDate()).toBe(17);
    });
  });

  describe('skipping invalid cards', () => {
    it('skips cards without a date', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const tba = events.find((e) => e.title === 'TBA Theater Production');
      expect(tba).toBeUndefined();
      expect(noopLogger.debug).toHaveBeenCalledWith(
        'skipping card: missing date',
        expect.objectContaining({ title: 'TBA Theater Production' }),
      );
    });

    it('skips cards without a title', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      // Fixture has 7 cards, 2 should be skipped (no date, no title)
      // So exactly 5 valid events
      expect(events).toHaveLength(5);
    });
  });

  describe('detail page fetching', () => {
    it('fetches detail page when listing card lacks description', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const townMeeting = events.find(
        (e) => e.externalId === 'montpelier-town-meeting-05-03-2025-14-00-00',
      );
      expect(townMeeting).toBeDefined();
      // Detail page provides descriptionHtml
      expect(townMeeting!.descriptionHtml).toContain('Town Meeting Day celebration');
    });

    it('does not fetch detail page when listing card has description', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find(
        (e) => e.externalId === 'burlington-jazz-weekend-05-01-2025-12-00-00',
      );
      expect(jazz).toBeDefined();
      expect(jazz!.descriptionHtml).toContain('jazz celebration');

      // Verify no detail fetch for this event
      const fetchCalls = vi.mocked(ctx.fetch).mock.calls;
      const detailCalls = fetchCalls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('burlington-jazz-weekend'),
      );
      expect(detailCalls).toHaveLength(0);
    });
  });

  describe('pagination config', () => {
    it('defaults pages to 2 when not specified', () => {
      const parsed = vermontPublicAdapter.configSchema!.parse({});
      expect(parsed).toEqual({ pages: 2 });
    });

    it('accepts custom page count', () => {
      const parsed = vermontPublicAdapter.configSchema!.parse({ pages: 5 });
      expect(parsed).toEqual({ pages: 5 });
    });

    it('rejects pages > 20', () => {
      expect(() => vermontPublicAdapter.configSchema!.parse({ pages: 25 })).toThrow();
    });

    it('rejects pages < 1', () => {
      expect(() => vermontPublicAdapter.configSchema!.parse({ pages: 0 })).toThrow();
    });
  });
});
